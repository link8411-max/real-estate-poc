#!/usr/bin/env python3
"""
Cloudflare R2 유틸리티
- S3 호환 API 사용 (boto3)
- DB 파일 업로드/다운로드
"""

import os
import boto3
from botocore.config import Config
from datetime import datetime


# R2 설정 (환경변수에서 로드)
R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "real-estate-db")

# 파일 설정
DB_FILENAME = "real_estate.db"
LOCAL_DB_PATH = os.environ.get("DB_PATH", "real_estate.db")


def get_r2_client():
    """R2 클라이언트 생성"""
    if not all([R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]):
        raise ValueError(
            "R2 환경변수가 설정되지 않았습니다.\n"
            "필수: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
        )

    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"}
        )
    )


def download_db(local_path: str = None) -> bool:
    """R2에서 DB 파일 다운로드"""
    local_path = local_path or LOCAL_DB_PATH

    try:
        client = get_r2_client()
        print(f"[R2] Downloading {DB_FILENAME} from R2...")

        client.download_file(R2_BUCKET_NAME, DB_FILENAME, local_path)

        size_mb = os.path.getsize(local_path) / (1024 * 1024)
        print(f"[R2] Download complete: {local_path} ({size_mb:.1f} MB)")
        return True

    except client.exceptions.NoSuchKey:
        print(f"[R2] File not found in R2: {DB_FILENAME}")
        return False
    except Exception as e:
        print(f"[R2] Download failed: {e}")
        return False


def upload_db(local_path: str = None) -> bool:
    """DB 파일을 R2에 업로드"""
    local_path = local_path or LOCAL_DB_PATH

    if not os.path.exists(local_path):
        print(f"[R2] Local file not found: {local_path}")
        return False

    try:
        client = get_r2_client()
        size_mb = os.path.getsize(local_path) / (1024 * 1024)
        print(f"[R2] Uploading {local_path} ({size_mb:.1f} MB) to R2...")

        # 메타데이터 추가
        client.upload_file(
            local_path,
            R2_BUCKET_NAME,
            DB_FILENAME,
            ExtraArgs={
                "Metadata": {
                    "uploaded-at": datetime.now().isoformat(),
                    "size-mb": str(round(size_mb, 1))
                }
            }
        )

        print(f"[R2] Upload complete: {DB_FILENAME}")
        return True

    except Exception as e:
        print(f"[R2] Upload failed: {e}")
        return False


def get_db_info() -> dict:
    """R2에 저장된 DB 정보 조회"""
    try:
        client = get_r2_client()
        response = client.head_object(Bucket=R2_BUCKET_NAME, Key=DB_FILENAME)

        return {
            "exists": True,
            "size_bytes": response["ContentLength"],
            "size_mb": round(response["ContentLength"] / (1024 * 1024), 1),
            "last_modified": response["LastModified"].isoformat(),
            "metadata": response.get("Metadata", {})
        }

    except client.exceptions.ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return {"exists": False}
        raise
    except Exception as e:
        return {"exists": False, "error": str(e)}


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python r2_utils.py <download|upload|info>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "download":
        success = download_db()
        sys.exit(0 if success else 1)

    elif command == "upload":
        success = upload_db()
        sys.exit(0 if success else 1)

    elif command == "info":
        info = get_db_info()
        if info.get("exists"):
            print(f"DB exists in R2:")
            print(f"  Size: {info['size_mb']} MB")
            print(f"  Last modified: {info['last_modified']}")
        else:
            print("DB not found in R2")
            if "error" in info:
                print(f"  Error: {info['error']}")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
