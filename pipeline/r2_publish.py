"""export_json 산출물(out_dir/{key}.gz)을 공개 R2 버킷에 업로드한다."""
from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

CACHE_CONTROL = "public, max-age=600"


class PublishError(Exception):
    def __init__(self, failures: list[tuple[str, Exception]]):
        self.failures = failures
        first = ", ".join(k for k, _ in failures[:5])
        super().__init__(f"{len(failures)}개 업로드 실패 (처음 5개: {first})")


def publish(out_dir: str, keys: list[str], *, bucket: str | None = None,
            client=None, max_workers: int = 8) -> int:
    bucket = bucket or os.environ.get("R2_PUBLIC_BUCKET")
    if not bucket:
        raise ValueError("R2_PUBLIC_BUCKET 환경변수 또는 bucket 인자가 필요합니다")
    if client is None:
        from r2_utils import get_r2_client
        client = get_r2_client()

    def upload(key: str) -> None:
        with open(os.path.join(out_dir, f"{key}.gz"), "rb") as f:
            body = f.read()
        client.put_object(
            Bucket=bucket, Key=key, Body=body,
            ContentType="application/json", ContentEncoding="gzip",
            CacheControl=CACHE_CONTROL,
        )

    total = len(keys)
    ok = 0
    failures: list[tuple[str, Exception]] = []
    with ThreadPoolExecutor(max_workers) as ex:
        futures = [(k, ex.submit(upload, k)) for k in keys]
        for i, (k, fut) in enumerate(futures, 1):
            try:
                fut.result()
                ok += 1
            except Exception as e:  # noqa: BLE001 - 키별로 모아서 마지막에 raise
                failures.append((k, e))
            if i % 1000 == 0:
                print(f"[R2] uploaded {i}/{total}")
    print(f"[R2] done: {ok} ok, {len(failures)} failed")
    if failures:
        raise PublishError(failures)
    return ok


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="R2 공개 버킷 발행")
    p.add_argument("--out", required=True)
    p.add_argument("--keys", required=True)
    p.add_argument("--bucket")
    p.add_argument("--workers", type=int, default=8)
    try:
        a = p.parse_args(argv)
    except SystemExit as e:
        return int(e.code or 0)
    try:
        with open(a.keys, encoding="utf-8") as f:
            keys = json.load(f)
        if not isinstance(keys, list) or not all(isinstance(k, str) for k in keys):
            raise ValueError("문자열 리스트여야 합니다")
    except (OSError, ValueError) as e:
        print(f"--keys 파일을 읽을 수 없습니다: {e}", file=sys.stderr)
        return 2
    try:
        publish(a.out, keys, bucket=a.bucket, max_workers=a.workers)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2
    except PublishError as e:
        print(str(e), file=sys.stderr)
        for k, err in e.failures:
            print(f"  {k}: {err!r}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
