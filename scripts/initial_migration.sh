#!/usr/bin/env bash
# 최초 이전 (Task 10). 사용자 Mac 에서 실행한다.
#
#   bash scripts/initial_migration.sh                        # = download,migrate,coords,split,trade,geocode
#   STEP=download,migrate,coords bash scripts/initial_migration.sh
#   STEP=rent1 bash scripts/initial_migration.sh             # 전월세는 항상 명시적으로, 하루 한 덩어리
#   STEP=publish,upload bash scripts/initial_migration.sh
#
# 단계: download migrate coords split trade rent1 rent2 rent3 geocode publish upload
#   `all`(기본) = download migrate coords split trade geocode   (rent*, publish, upload 는 제외)
#   rent1 = 201101-201512, rent2 = 201601-202012, rent3 = 202101-202610
#
# [쿼터] MOLIT 키는 하루 10,000콜 공용이고 매일 수집 CI 가 약 1,000콜/일을 쓴다.
#   그래서 하루에 이 스크립트로 쓰는 호출은 약 8,000 미만으로 제한한다:
#   split(2,750)+trade(747) = 약 3,500, rent1/2 = 각 4,980, rent3 = 5,810 -> 전월세는 하루 한 덩어리.
#   각 단계 헤더에 calls≈N 이 출력된다.
#
# [실패 게이트] 수집 단계는 summary_<단계>.json 을 남기고, 실패(failed_count>0)가 있으면
#   geocode/publish/upload 전에 멈추고 재시도 명령을 출력한다.
#
# [R2 정본 경합] 이전 작업 동안 CI 가 DB 를 덮어쓰지 않도록 시작 전에:
#     gh workflow disable "Daily Collection" -R link8411-max/real-estate-poc
#   끝난 뒤(upload 후) 다시:
#     gh workflow enable "Daily Collection" -R link8411-max/real-estate-poc
#   download -> 작업 -> upload 는 한 번에 끝내야 한다. download 시 R2 last-modified 를
#   .migration_state 에 기록하고, upload 직전에 비교해 달라졌으면 중단한다(FORCE_UPLOAD=1 로 무시).
#
# 필요 환경변수(.env): MOLIT_API_KEY, R2_*, R2_PUBLIC_BUCKET, SUPABASE_URL,
#                      SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY
set -euo pipefail
cd "$(dirname "$0")/.."

command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 가 필요합니다" >&2; exit 2; }

# caffeinate 로 감싸서 다시 실행 (잠자기 방지)
if [ -z "${_MIGRATION_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  export _MIGRATION_CAFFEINATED=1
  exec caffeinate -i bash "$0" "$@"
fi

# .env 는 source 하지 않고 KEY=VALUE 줄만 읽는다.
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    key="${line%%=*}"
    val="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    export "$key=$val"
  done < .env
fi

if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=python3; fi
DB=real_estate.db
STATE=.migration_state
SPLIT_CODES=28125,28155,28275,28290,41192,41194,41196,41591,41593,41595,41597
NSPLIT=11
NREG=$("$PY" -c "from pipeline.regions import REGIONS; print(len(REGIONS))")
ALL_STEPS="download migrate coords split trade rent1 rent2 rent3 geocode publish upload"
DEFAULT_STEPS="download migrate coords split trade geocode"
STEP="${STEP:-all}"
[ "$STEP" = "all" ] && STEP="${DEFAULT_STEPS// /,}"

want() { case ",$STEP," in *",$1,"*) return 0 ;; esac; return 1; }
header() { printf '\n========== [%s] %s ==========\n' "$1" "$2"; }
sql() { echo "-- $1"; sqlite3 "$DB" "$1"; }
# months FROM TO -> 개월 수
months() { echo $(( (${2:0:4} - ${1:0:4}) * 12 + 10#${2:4:2} - 10#${1:4:2} + 1 )); }
# calls REGIONS FROM TO KINDS
calls() { echo $(( $1 * $(months "$2" "$3") * $4 )); }

r2_modified() { "$PY" r2_utils.py info | sed -n 's/^ *Last modified: *//p'; }

for s in ${STEP//,/ }; do
  case " $ALL_STEPS " in *" $s "*) ;; *) echo "알 수 없는 STEP: $s (가능: $ALL_STEPS)" >&2; exit 2 ;; esac
done

# collect_step NAME -- <collect args...>
# 수집 후 실패가 있으면 멈추고 재시도 명령을 출력한다.
collect_step() {
  local name="$1" summary="summary_$1.json"; shift 2
  "$PY" -m pipeline.collect --db "$DB" --summary-out "$summary" "$@"
  local failed
  failed=$("$PY" -c "import json,sys; print(json.load(open(sys.argv[1]))['failed_count'])" "$summary")
  if [ "$failed" -gt 0 ]; then
    echo "!! [$name] 실패 ${failed}건 -> geocode/publish/upload 전에 중단합니다. 재시도:" >&2
    echo "   $PY -m pipeline.collect --db $DB --retry-failed $summary --summary-out ${summary%.json}_retry.json" >&2
    echo "   (성공하면 이후 단계를 STEP=... 으로 이어서 실행)" >&2
    exit 1
  fi
}

if want download; then
  header download "Step 1: 정본 DB 내려받기 (calls≈0)"
  echo "!! CI 와의 경합 방지: gh workflow disable \"Daily Collection\" -R link8411-max/real-estate-poc"
  "$PY" r2_utils.py download
  r2_modified > "$STATE"
  [ -s "$STATE" ] || { echo "R2 last-modified 를 읽지 못했습니다" >&2; exit 1; }
  echo "R2 last-modified 기록: $(cat "$STATE")"
  sql "select max(deal_date) from transactions"
fi

if want migrate; then
  header migrate "Step 2a: 스키마 이전 (calls≈0)"
  "$PY" -c "from pipeline.db import connect, migrate; migrate(connect('$DB'))"
fi

if want coords; then
  header coords "Step 2b: 좌표 이식 (기대: 약 12,900건) (calls≈0)"
  "$PY" -m pipeline.migrate_coords --src real_estate_local_20260121.db --db "$DB"
fi

if want split; then
  header split "Step 3a: 분구 지역 전 기간 매매 백필 calls≈$(calls $NSPLIT 200601 202610 1)"
  collect_step split -- --kind trade --from 200601 --to 202610 --regions "$SPLIT_CODES"
  sql "select count(*) from apartments where lawd_cd in ('28110','28140','28260','41190','41590')"
  sql "select count(*) from apartments where lawd_cd like '4119%'"
fi

if want trade; then
  header trade "Step 3: 매매 백필 202602-202610 calls≈$(calls "$NREG" 202602 202610 1)"
  collect_step trade -- --kind trade --from 202602 --to 202610
  sql "select count(*) from transactions where deal_date between '2026-05-01' and '2026-08-31'"
  sql "select count(*) from transactions t join apartments a on a.id=t.apt_id where a.lawd_cd in ('28125','28155','28275','28290') and deal_date >= '2026-07-01'"
fi

rent_chunk() { # NAME FROM TO
  header "$1" "Step 4 ($1): 전월세 $2-$3 calls≈$(calls "$NREG" "$2" "$3" 1) (하루에 한 덩어리만)"
  collect_step "$1" -- --kind rent --from "$2" --to "$3"
  sql "select count(*) from rents"
}
if want rent1; then rent_chunk rent1 201101 201512; fi
if want rent2; then rent_chunk rent2 201601 202012; fi
if want rent3; then rent_chunk rent3 202101 202610; fi

if want geocode; then
  header geocode "Step 5: 좌표 채우기 (기대: 성공 5,000 이상) (Kakao, MOLIT calls≈0)"
  "$PY" -m pipeline.geocode --db "$DB"
  sql "select count(*) from apartments where latitude is null and geocode_quality is null"
fi

if want publish; then
  header publish "Step 6: 전체 내보내기 + 발행 + 동기화 (calls≈0)"
  "$PY" -m pipeline.export_json --db "$DB" --out out --all
  "$PY" -m pipeline.r2_publish --out out --keys out/keys.json
  "$PY" -m pipeline.supabase_sync --db "$DB" --all
  echo "확인: curl -s --compressed \$R2_PUBLIC_URL/v1/meta.json 의 rent_count > 0"
fi

if want upload; then
  header upload "Step 7: 정본 DB 업로드 (calls≈0)"
  echo "!! 업로드 후 반드시: gh workflow enable \"Daily Collection\" -R link8411-max/real-estate-poc"
  if [ -z "${FORCE_UPLOAD:-}" ]; then
    if [ ! -f "$STATE" ]; then
      echo "$STATE 없음: 이 DB 가 R2 어느 시점에서 받은 것인지 알 수 없어 중단합니다 (FORCE_UPLOAD=1 로 무시)." >&2
      exit 1
    fi
    now="$(r2_modified)"
    if [ "$now" != "$(cat "$STATE")" ]; then
      echo "R2 정본이 download 이후 바뀌었습니다 (기록: $(cat "$STATE"), 현재: $now). 업로드 중단." >&2
      exit 1
    fi
  fi
  "$PY" r2_utils.py upload
  r2_modified > "$STATE"
fi

echo; echo "완료 (STEP=$STEP)"
echo "리마인더: 이전을 끝냈다면 gh workflow enable \"Daily Collection\" -R link8411-max/real-estate-poc"
