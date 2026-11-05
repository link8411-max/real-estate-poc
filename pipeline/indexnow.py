"""바뀐 페이지 주소를 IndexNow 엔드포인트(네이버·공용)에 알린다.

사용: python -m pipeline.indexnow --changed changed_apts.json
      python -m pipeline.indexnow --sitemap https://zipsise.com/sitemap.xml [--dry-run]
수집 워크플로를 깨지 않도록 전송이 실패해도 종료 코드는 0 이다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from urllib.parse import urlparse

import requests

SITE = "https://zipsise.com"
# 공개값(사이트에 키 파일로 그대로 노출되는 게 IndexNow 규격이다)
DEFAULT_KEY = "96af640fabc32046427f45ea7a8dbba5"
DEFAULT_ENDPOINTS = "https://searchadvisor.naver.com/indexnow,https://api.indexnow.org/indexnow"
HUB_PATHS = ["/", "/highs", "/canceled", "/stats"]
CHUNK_SIZE = 10_000
TIMEOUT = 30
PAUSE = 1.0  # 요청 사이 대기(초)


def build_urls(site: str, apt_ids: list[int]) -> list[str]:
    """바뀐 단지 페이지 + 고정 허브. 바뀐 단지가 없으면 빈 목록. 중복 제거, 순서 유지."""
    if not apt_ids:
        return []
    site = site.rstrip("/")
    urls = [f"{site}/apartment/{i}" for i in apt_ids] + [f"{site}{p}" for p in HUB_PATHS]
    return list(dict.fromkeys(urls))


def parse_sitemap(xml_text: str) -> list[str]:
    """사이트맵 XML(네임스페이스 포함)에서 <loc> 전부."""
    locs = re.findall(r"<(?:\w+:)?loc>\s*([^<]+?)\s*</(?:\w+:)?loc>", xml_text)
    return list(dict.fromkeys(l.replace("&amp;", "&") for l in locs))


def chunks(urls: list[str], n: int = CHUNK_SIZE) -> list[list[str]]:
    return [urls[i:i + n] for i in range(0, len(urls), n)]


def payload(site: str, key: str, urls: list[str]) -> dict:
    site = site.rstrip("/")
    return {
        "host": urlparse(site).netloc,
        "key": key,
        "keyLocation": f"{site}/{key}.txt",
        "urlList": urls,
    }


def _post(endpoint: str, body: dict) -> int:
    res = requests.post(endpoint, json=body, timeout=TIMEOUT,
                        headers={"Content-Type": "application/json; charset=utf-8"})
    return res.status_code


def _label(endpoint: str) -> str:
    host = urlparse(endpoint).netloc
    return "naver" if "naver" in host else host


def notify(site: str, key: str, urls: list[str], endpoints: list[str], *,
           post=_post, sleep=time.sleep) -> list[tuple[str, str, int]]:
    """엔드포인트 × 청크로 전송. 실패해도 예외를 내지 않고 (라벨, 상태, URL 수) 를 돌려준다."""
    results: list[tuple[str, str, int]] = []
    first = True
    for endpoint in endpoints:
        for part in chunks(urls):
            if not first:
                sleep(PAUSE)
            first = False
            try:
                status = str(post(endpoint, payload(site, key, part)))
            except Exception as e:  # 네트워크 오류 등: 수집을 깨지 않는다
                status = f"error {type(e).__name__}"
            results.append((_label(endpoint), status, len(part)))
    return results


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="IndexNow 알림")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--changed", help="changed_apts.json (정수 apt_id 배열)")
    src.add_argument("--sitemap", help="사이트맵 URL(<loc> 전부 전송)")
    ap.add_argument("--site", default=SITE)
    ap.add_argument("--key", default=os.environ.get("INDEXNOW_KEY") or DEFAULT_KEY)
    ap.add_argument("--endpoints", default=DEFAULT_ENDPOINTS)
    ap.add_argument("--dry-run", action="store_true", help="보내지 않고 개수·첫 5개만 출력")
    args = ap.parse_args(argv)

    if args.changed:
        with open(args.changed, encoding="utf-8") as f:
            ids = [int(i) for i in json.load(f)]
        urls = build_urls(args.site, ids)
    else:
        try:
            res = requests.get(args.sitemap, timeout=TIMEOUT)
            res.raise_for_status()
            urls = parse_sitemap(res.text)
        except Exception as e:
            print(f"indexnow: 사이트맵 읽기 실패 ({type(e).__name__})")
            return 0

    parts = len(chunks(urls))
    if args.dry_run:
        print(f"indexnow dry-run: {len(urls)} urls, {parts} chunks")
        for u in urls[:5]:
            print(f"  {u}")
        return 0
    if not urls:
        print("indexnow: 보낼 URL 없음")
        return 0

    endpoints = [e.strip() for e in args.endpoints.split(",") if e.strip()]
    for label, status, n in notify(args.site, args.key, urls, endpoints):
        print(f"indexnow {label}: {status} ({n} urls)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
