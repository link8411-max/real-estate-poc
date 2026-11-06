"""건축물대장 전유공용면적 대용량 파일(건축HUB)로 register_types 를 한 번에 채운다.

API 는 하루 1만 회 한도라 전 단지를 채우는 데 몇 주 걸린다. 건축HUB "대용량 제공
서비스"가 같은 데이터를 매월 전국 파일(zip 안에 텍스트 1개, 압축 해제 수십 GB)로
주므로, zip 을 풀지 않고 스트리밍으로 읽어 우리 단지 키에 해당하는 줄만 집계한다.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sqlite3
import sys
import time
import zipfile
from collections import defaultdict

import requests

from pipeline.db import connect, migrate
from pipeline.register_keys import RegisterKey, register_keys
from pipeline.supply import UnitAccumulator, types_from_units
from pipeline.supply_fetch import _record

BASE = "https://www.hub.go.kr"
LIST_URL = f"{BASE}/portal/opn/lps/idx-lgcpt-pvsn-srvc-list.do"
HISTORY_URL = f"{BASE}/portal/opn/lps/idx-srvc-hstry-insert.do"
DOWNLOAD_URL = f"{BASE}/cmm/fms/fileOpnDown.do"
LIST_PAGES = 4
TIMEOUT = 60
CHUNK = 1 << 20

# 한 줄 39개 필드, 구분자 '|', 헤더 없음. 순서는 API JSON 키와 같다.
FIELDS = (
    "mgmBldrgstPk regstrGbCd regstrGbCdNm regstrKindCd regstrKindCdNm platPlc newPlatPlc bldNm "
    "sigunguCd bjdongCd platGbCd bun ji splotNm block lot naRoadCd naBjdongCd naUgrndCd naMainBun "
    "naSubBun dongNm hoNm flrGbCd flrGbCdNm flrNo exposPubuseGbCd exposPubuseGbCdNm mainAtchGbCd "
    "mainAtchGbCdNm flrNoNm strctCd strctCdNm etcStrct mainPurpsCd mainPurpsCdNm etcPurps area crtnDay"
).split()
N_FIELDS = len(FIELDS)
_IDX = {n: i for i, n in enumerate(FIELDS)}
# UnitAccumulator 가 쓰는 필드만 dict 로 만든다(줄마다 39개를 다 만들면 느리다)
_USED = ("mgmBldrgstPk", "dongNm", "hoNm", "exposPubuseGbCd", "mainPurpsCdNm", "etcPurps")
_USED_IDX = tuple((n, _IDX[n]) for n in _USED)
_I_SIGUNGU, _I_BJDONG, _I_PLAT, _I_BUN, _I_JI, _I_AREA = (
    _IDX[n] for n in ("sigunguCd", "bjdongCd", "platGbCd", "bun", "ji", "area"))

_ROW = re.compile(r"<tr\b.*?</tr>", re.S)
_CELL = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.S)
_TAGS = re.compile(r"<[^>]+>")
_ONCLICK = re.compile(r"fnDownloadPop\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']+)'\s*\)")
_YM = re.compile(r"전유공용면적\s*\(\s*(\d{4})년\s*(\d{1,2})월\s*\)")


class BulkError(Exception):
    pass


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", _TAGS.sub(" ", html)).strip()


def parse_list(html: str) -> list[tuple[str, str]]:
    """목록 HTML → [(파일 id, "YYYY-MM")]. 구분이 '건축물대장'인 전유공용면적 행만."""
    out: list[tuple[str, str]] = []
    for row in _ROW.findall(html):
        cells = [_text(c) for c in _CELL.findall(row)]
        if "건축물대장" not in cells:  # 폐쇄말소대장·주택인허가·건축인허가 같은 이름 행 제외
            continue
        m = _YM.search(_text(row))
        f = _ONCLICK.search(row)
        if m and f:
            out.append((f.group(1), f"{m.group(1)}-{int(m.group(2)):02d}"))
    return out


def find_latest_file_id(session) -> tuple[str, str]:
    """목록 페이지 1..4 에서 가장 최근 년월의 건축물대장 전유공용면적 (파일 id, 'YYYY-MM')."""
    found: list[tuple[str, str]] = []
    for page in range(1, LIST_PAGES + 1):
        resp = session.get(LIST_URL, params={"pageIndex": page}, timeout=TIMEOUT)
        resp.raise_for_status()
        found += parse_list(resp.text)
    if not found:
        raise BulkError("건축물대장 전유공용면적 파일을 목록에서 찾지 못했습니다")
    file_id, ym = max(found, key=lambda x: x[1])
    return file_id, ym


def download(session, file_id: str, dest_path: str) -> int:
    """이용 목적을 기록하고 zip 을 스트리밍으로 dest_path 에 저장한다. 저장한 바이트 수."""
    session.get(LIST_URL, params={"pageIndex": 1}, timeout=TIMEOUT).raise_for_status()
    session.post(HISTORY_URL, data={"opnLgcptTaskSeCd": "03", "opnTaskCd": "0306",
                                    "opnPrcusePrpsCd": "1"}, timeout=TIMEOUT).raise_for_status()
    resp = session.post(DOWNLOAD_URL, data={"srvrFileNm": file_id}, stream=True, timeout=TIMEOUT)
    resp.raise_for_status()
    size = 0
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(CHUNK):
            f.write(chunk)
            size += len(chunk)
    if size == 0:
        raise BulkError("받은 파일이 비어 있습니다")
    if not zipfile.is_zipfile(dest_path):
        raise BulkError("받은 파일이 zip 이 아닙니다")
    return size


def build_keys(conn: sqlite3.Connection) -> tuple[dict[RegisterKey, list[int]], set[str]]:
    """키 → 단지 id 목록. 합쳐진 단지(alias old_id)와 키를 못 만드는 단지는 제외."""
    merged = {r[0] for r in conn.execute("SELECT old_id FROM apartment_aliases")}
    keys: dict[RegisterKey, list[int]] = defaultdict(list)
    for (apt_id,) in conn.execute("SELECT id FROM apartments ORDER BY id").fetchall():
        if apt_id in merged:
            continue
        k = register_keys(conn, apt_id)
        if k is not None:
            keys[k].append(apt_id)
    return dict(keys), {k.sigungu_cd for k in keys}


def _open_text(zf: zipfile.ZipFile):
    names = [i for i in zf.infolist() if not i.is_dir()]
    if not names:
        raise BulkError("zip 안에 파일이 없습니다")
    return zf.open(names[0])


def ingest(conn: sqlite3.Connection, zip_path: str) -> dict:
    """zip 을 스트리밍으로 읽어 우리 단지 키 줄만 집계하고 register_types·register_fetch 를 채운다."""
    t0 = time.monotonic()
    keys, sigungu = build_keys(conn)
    sig_b = {s.encode() for s in sigungu}
    kb = {(k.sigungu_cd.encode(), k.bjdong_cd.encode(), k.bun.encode(), k.ji.encode()): k for k in keys}
    accs: dict[RegisterKey, UnitAccumulator] = {}
    lines = skipped = 0
    with zipfile.ZipFile(zip_path) as zf, _open_text(zf) as raw:
        for line in io.BufferedReader(raw, CHUNK):
            lines += 1
            line = line.rstrip(b"\r\n")
            if not line:
                continue
            # 사전 필터: 시군구가 우리 단지에 없으면 전체 split 없이 버린다.
            # 시군구는 9번째 필드이므로 앞 9개만 쪼갠다(필드 수 검사는 통과분만).
            head = line.split(b"|", 9)
            if len(head) < 10 or head[_I_SIGUNGU] not in sig_b:
                if len(head) < 10:
                    skipped += 1
                continue
            parts = line.split(b"|")
            if len(parts) != N_FIELDS:
                skipped += 1
                continue
            if parts[_I_PLAT] != b"0":
                continue
            key = kb.get((parts[_I_SIGUNGU], parts[_I_BJDONG], parts[_I_BUN], parts[_I_JI]))
            if key is None:
                continue
            try:
                area = float(parts[_I_AREA])
            except ValueError:
                skipped += 1
                continue
            row = {n: parts[i].decode("utf-8", "replace") for n, i in _USED_IDX}
            row["area"] = area
            acc = accs.get(key)
            if acc is None:
                acc = accs[key] = UnitAccumulator()
            acc.add_rows([row])
    done = empty = 0
    for key, apt_ids in keys.items():
        acc = accs.get(key)
        types = []
        if acc is not None:
            acc.close()
            types = types_from_units(acc.finished_units())
        status = "done" if types else "empty"  # empty 면 _record 가 기존 register_types 를 지우지 않는다
        for apt_id in apt_ids:
            _record(conn, apt_id, status, 0, types)
            if types:
                done += 1
            else:
                empty += 1
    return {"lines": lines, "skipped_lines": skipped, "matched_keys": len(accs),
            "apartments_done": done, "apartments_empty": empty,
            "seconds": round(time.monotonic() - t0, 1)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="건축물대장 전유공용면적 대용량 파일 적재")
    ap.add_argument("--db", default="real_estate.db")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--zip", help="이미 받은 zip 경로")
    g.add_argument("--download-to", help="최신 파일을 이 경로에 내려받아 적재")
    ap.add_argument("--keep-zip", action="store_true", help="--download-to 로 받은 zip 을 지우지 않음")
    a = ap.parse_args(argv)
    path = a.zip
    ym = None
    if a.download_to:
        session = requests.Session()
        file_id, ym = find_latest_file_id(session)
        size = download(session, file_id, a.download_to)
        print(f"받음: {ym} {size} bytes", file=sys.stderr)
        path = a.download_to
    conn = connect(a.db)
    try:
        migrate(conn)
        summary = ingest(conn, path)
    finally:
        conn.close()
        if a.download_to and not a.keep_zip and os.path.exists(a.download_to):
            os.remove(a.download_to)
    if ym:
        summary["file_month"] = ym
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
