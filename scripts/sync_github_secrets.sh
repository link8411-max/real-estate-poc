#!/usr/bin/env bash
# .env 의 값을 GitHub Actions Secrets 로 올린다. (값은 출력하지 않음)
# 사용: bash scripts/sync_github_secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="link8411-max/real-estate-poc"

val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- ; }

for name in SUPABASE_URL KAKAO_REST_API_KEY SUPABASE_SERVICE_ROLE_KEY R2_PUBLIC_BUCKET; do
  v="$(val "$name" || true)"
  if [ -z "$v" ]; then echo "skip $name (.env 에 없음)"; continue; fi
  gh secret set "$name" -R "$REPO" -b "$v" && echo "set $name"
done
gh secret list -R "$REPO" | cut -f1
