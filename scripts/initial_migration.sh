#!/usr/bin/env bash
# 최초 이전 (Task 10). 사용자 Mac 에서 실행한다.
#
#   bash scripts/initial_migration.sh                          # 모든 단계 (rent1, rent2 포함)
#   STEP=download,migrate,coords bash scripts/initial_migration.sh
#   STEP=rent1 bash scripts/initial_migration.sh               # 1일차 전월세 (201101-201812)
#   STEP=rent2 bash scripts/initial_migration.sh               # 2일차 전월세 (201901-202610)
#
# 단계: download migrate coords split trade rent1 rent2 geocode publish upload
# 필요한 환경변수(.env): MOLIT_API_KEY, R2_*, R2_PUBLIC_BUCKET, SUPABASE_URL,
#                        SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY
set -euo pipefail
cd "$(dirname "$0")/.."

# caffeinate 로 감싸서 다시 실행 (잠자기 방지)
if [ -z "${_MIGRATION_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  export _MIGRATION_CAFFEINATED=1
  exec caffeinate -i bash "$0" "$@"
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=python3; fi
DB=real_estate.db
SPLIT_CODES=28125,28155,28275,28290,41192,41194,41196,41591,41593,41595,41597
ALL_STEPS="download migrate coords split trade rent1 rent2 geocode publish upload"
STEP="${STEP:-all}"

want() {
  [ "$STEP" = "all" ] && return 0
  case ",$STEP," in *",$1,"*) return 0 ;; esac
  return 1
}
header() { printf '\n========== [%s] %s ==========\n' "$1" "$2"; }
sql() { echo "-- $1"; sqlite3 "$DB" "$1"; }

for s in ${STEP//,/ }; do
  [ "$s" = "all" ] && continue
  case " $ALL_STEPS " in *" $s "*) ;; *) echo "알 수 없는 STEP: $s (가능: $ALL_STEPS)" >&2; exit 2 ;; esac
done

if want download; then
  header download "Step 1: 정본 DB 내려받기"
  "$PY" r2_utils.py download
  sql "select max(deal_date) from transactions"
fi

if want migrate; then
  header migrate "Step 2a: 스키마 이전"
  "$PY" -c "from pipeline.db import connect, migrate; migrate(connect('$DB'))"
fi

if want coords; then
  header coords "Step 2b: 좌표 이식 (기대: 약 12,900건)"
  "$PY" -m pipeline.migrate_coords --src real_estate_local_20260121.db --db "$DB"
fi

if want split; then
  header split "Step 3a: 분구 지역 전 기간 매매 백필 (11코드 x 250개월)"
  "$PY" -m pipeline.collect --db "$DB" --kind trade --from 200601 --to 202610 --regions "$SPLIT_CODES"
  sql "select count(*) from apartments where lawd_cd in ('28110','28140','28260','41190','41590')"
  sql "select count(*) from apartments where lawd_cd like '4119%'"
fi

if want trade; then
  header trade "Step 3: 매매 백필 202602-202610 (83지역)"
  "$PY" -m pipeline.collect --db "$DB" --kind trade --from 202602 --to 202610
  sql "select count(*) from transactions where deal_date between '2026-05-01' and '2026-08-31'"
  sql "select count(*) from transactions t join apartments a on a.id=t.apt_id where a.lawd_cd in ('28125','28155','28275','28290') and deal_date >= '2026-07-01'"
fi

if want rent1; then
  header rent1 "Step 4 (1일차): 전월세 201101-201812"
  "$PY" -m pipeline.collect --db "$DB" --kind rent --from 201101 --to 201812
  sql "select count(*) from rents"
fi

if want rent2; then
  header rent2 "Step 4 (2일차): 전월세 201901-202610"
  "$PY" -m pipeline.collect --db "$DB" --kind rent --from 201901 --to 202610
  sql "select count(*) from rents"
fi

if want geocode; then
  header geocode "Step 5: 좌표 채우기 (기대: 성공 5,000 이상)"
  "$PY" -m pipeline.geocode --db "$DB"
  sql "select count(*) from apartments where latitude is null and geocode_quality is null"
fi

if want publish; then
  header publish "Step 6: 전체 내보내기 + 발행 + 동기화"
  "$PY" -m pipeline.export_json --db "$DB" --out out --all
  "$PY" -m pipeline.r2_publish --out out --keys out/keys.json
  "$PY" -m pipeline.supabase_sync --db "$DB" --all
  echo "확인: curl -s --compressed \$R2_PUBLIC_URL/v1/meta.json 의 rent_count > 0"
fi

if want upload; then
  header upload "Step 7: 정본 DB 업로드"
  "$PY" r2_utils.py upload
fi

echo; echo "완료 (STEP=$STEP)"
