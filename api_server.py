from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import sqlite3
from typing import List, Optional
import json
import time as time_module

app = FastAPI(title="Sudogwon Insight API")

# ========== 전역 캐시 저장소 (TTL 없음 - 이벤트로 무효화) ==========
CACHE = {
    "search": {},        # key: "검색어:limit"
    "stats": {},         # key: "market"
    "stats_regions": {}, # key: "all"
    "hierarchy": {},     # key: "all"
    "transactions": {},  # key: "limit:{n}"
    "apartment": {},     # key: "{apt_id}"
    "history": {},       # key: "{apt_id}:{months}:{area}"
    "region_apartments": {},  # key: "{lawd_cd}:{limit}:{offset}:{sort}"
    "region_stats": {},  # key: "{lawd_cd}"
}

def clear_all_cache():
    """수집 완료 시 호출 - 모든 캐시 클리어"""
    for cache_name, cache in CACHE.items():
        cache.clear()
    print(f"[CACHE] All caches cleared at {time_module.time()}")

def get_cache_stats():
    """캐시 통계 반환"""
    stats = {}
    for name, cache in CACHE.items():
        stats[name] = len(cache)
    return stats

# 요청 타이밍 미들웨어 - 모든 요청의 시작/종료 시간 기록
class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time_module.time()
        method = request.method
        path = request.url.path
        query = str(request.url.query)[:50] if request.url.query else ""
        print(f"[REQ START] {method} {path}?{query} time={start:.3f}", flush=True)

        response = await call_next(request)

        elapsed = time_module.time() - start
        print(f"[REQ END] {method} {path} elapsed={elapsed:.3f}s", flush=True)
        return response

app.add_middleware(TimingMiddleware)

# 서버 시작 시 DB 워밍업 (캐시 프리로드)
@app.on_event("startup")
async def warmup_db():
    """서버 시작 시 DB 쿼리를 미리 실행하여 SQLite 캐시 워밍업"""
    import time
    import sys
    start = time.time()
    print("[WARMUP] Starting database warmup...", flush=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # 인덱스 로드
        cursor.execute("SELECT COUNT(*) FROM apartments")
        apt_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM transactions")
        tx_count = cursor.fetchone()[0]

        # 자주 사용하는 쿼리 패턴 실행 (최근 거래 API)
        cursor.execute("""
            SELECT * FROM transactions
            ORDER BY deal_date DESC, id DESC
            LIMIT 20
        """)
        cursor.fetchall()

        # 검색 쿼리 워밍업
        cursor.execute("""
            SELECT id, name, dong FROM apartments WHERE name LIKE '%강남%' LIMIT 10
        """)
        cursor.fetchall()

        # 통계 쿼리 워밍업
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE deal_date >= date('now', '-30 days')")
        cursor.fetchone()

        elapsed = time.time() - start
        print(f"[WARMUP] Database warmed up in {elapsed:.3f}s (apts: {apt_count}, txs: {tx_count})", flush=True)
        sys.stdout.flush()
    except Exception as e:
        print(f"[WARMUP] Error: {e}", flush=True)
    finally:
        conn.close()

# CORS 설정 (Next.js 프론트엔드 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # PoC 단계이므로 전체 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "real_estate.db"

# 지역코드 -> 지역명 매핑 (빠른 조회용)
REGION_CODE_TO_NAME = {}
REGION_HIERARCHY = {
    "서울": {
        "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구",
        "11215": "광진구", "11230": "동대문구", "11260": "중랑구", "11290": "성북구",
        "11305": "강북구", "11320": "도봉구", "11350": "노원구", "11380": "은평구",
        "11410": "서대문구", "11440": "마포구", "11470": "양천구", "11500": "강서구",
        "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
        "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구",
        "11740": "강동구"
    },
    "경기": {
        "41111": "수원장안구", "41113": "수원권선구", "41115": "수원영통구", "41117": "수원팔달구",
        "41131": "성남수정구", "41133": "성남중원구", "41135": "성남분당구", "41150": "의정부시",
        "41171": "안양만안구", "41173": "안양동안구", "41190": "부천시", "41210": "광명시",
        "41220": "평택시", "41250": "동두천시", "41271": "안산상록구", "41273": "안산단원구",
        "41281": "고양덕양구", "41285": "고양일산동구", "41287": "고양일산서구", "41290": "과천시",
        "41310": "구리시", "41360": "남양주시", "41370": "오산시", "41390": "시흥시",
        "41410": "군포시", "41430": "의왕시", "41450": "하남시", "41461": "용인처인구",
        "41463": "용인기흥구", "41465": "용인수지구", "41480": "파주시", "41500": "이천시",
        "41550": "안성시", "41570": "김포시", "41590": "화성시", "41610": "광주시",
        "41630": "양주시", "41650": "포천시", "41670": "여주시", "41800": "연천군",
        "41820": "가평군", "41830": "양평군"
    },
    "인천": {
        "28110": "중구", "28140": "동구", "28177": "미추홀구", "28185": "연수구",
        "28200": "남동구", "28237": "부평구", "28245": "계양구", "28260": "서구",
        "28710": "강화군", "28720": "옹진군"
    }
}

# 초기화: 코드 -> "시/도 구/군" 매핑 생성
for city, districts in REGION_HIERARCHY.items():
    for code, name in districts.items():
        REGION_CODE_TO_NAME[code] = f"{city} {name}"

def get_region_name(lawd_cd: str) -> str:
    """지역코드로 '시/도 구/군' 형태의 지역명 반환"""
    return REGION_CODE_TO_NAME.get(lawd_cd, "")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/transactions")
async def get_transactions(limit: int = 20):
    """최근 실거래 데이터 목록 반환"""
    # 캐시 확인
    cache_key = f"limit:{limit}"
    if cache_key in CACHE["transactions"]:
        return CACHE["transactions"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT t.*, a.name as apt_name, a.dong, a.lawd_cd, i.summary_text
        FROM transactions t
        JOIN apartments a ON t.apt_id = a.id
        LEFT JOIN transaction_insights i ON t.id = i.transaction_id
        ORDER BY t.deal_date DESC, t.id DESC
        LIMIT ?
    """

    try:
        cursor.execute(query, (limit,))
        rows = cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d['region_name'] = get_region_name(d.get('lawd_cd', ''))
            result.append(d)
        # 캐시에 저장
        CACHE["transactions"][cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/stats")
async def get_market_stats():
    """수도권 시장 주요 지표 반환 (PoC용 더미 + 일부 실데이터)"""
    # 캐시 확인
    cache_key = "market"
    if cache_key in CACHE["stats"]:
        return CACHE["stats"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 최근 30일 거래량
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE deal_date >= date('now', '-30 days')")
        recent_count = cursor.fetchone()[0]

        # 전체 등록된 아파트 수
        cursor.execute("SELECT COUNT(*) FROM apartments")
        apt_count = cursor.fetchone()[0]

        result = {
            "growth_rate": "12.4%", # 실시간 계산 로직은 추후 고도화
            "buying_power": "72.4%",
            "active_nodes": "66",
            "recent_transactions_30d": recent_count,
            "total_apartments": apt_count,
            "status": "BULLISH"
        }
        # 캐시에 저장
        CACHE["stats"][cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/regions")
async def get_region_distribution():
    """지역별(시군구) 거래 분포 데이터 반환"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT a.lawd_cd, COUNT(*) as count
        FROM transactions t
        JOIN apartments a ON t.apt_id = a.id
        GROUP BY a.lawd_cd
    """

    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 검색 API ==========
import time as time_module

def find_region_codes_by_name(query: str) -> list:
    """검색어와 매칭되는 지역 코드 찾기 (시/구/군 이름 검색)"""
    query_lower = query.lower()
    matched_codes = []

    for city, districts in REGION_HIERARCHY.items():
        # 시/도 이름 매칭 (서울, 경기, 인천)
        if query_lower in city.lower():
            matched_codes.extend(districts.keys())
        else:
            # 구/군 이름 매칭
            for code, name in districts.items():
                if query_lower in name.lower():
                    matched_codes.append(code)

    return matched_codes

@app.get("/api/search")
def search_apartments(q: str, limit: int = 20):
    """아파트명 또는 지역명으로 검색 (FTS5 trigram + 지역코드)"""
    start_time = time_module.time()
    print(f"[API] Search started: q={q}, time={start_time}")

    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="검색어는 2자 이상 입력해주세요")

    # 캐시 확인
    cache_key = f"{q}:{limit}"
    if cache_key in CACHE["search"]:
        print(f"[API] Search cache HIT: {time_module.time() - start_time:.3f}s")
        return CACHE["search"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()
    print(f"[API] DB connected: {time_module.time() - start_time:.3f}s")

    # 지역명(시/구)으로 매칭되는 코드 찾기
    region_codes = find_region_codes_by_name(q)

    try:
        # FTS5 trigram 검색으로 아파트 ID 찾기
        fts_query = """
            SELECT rowid FROM apartments_fts
            WHERE apartments_fts MATCH ?
            LIMIT ?
        """
        cursor.execute(fts_query, (q, limit * 2))
        fts_ids = [row[0] for row in cursor.fetchall()]
        print(f"[API] FTS5 search done ({len(fts_ids)} ids): {time_module.time() - start_time:.3f}s")

        # 지역 코드로 추가 검색
        region_ids = []
        if region_codes:
            placeholders = ",".join(["?" for _ in region_codes])
            cursor.execute(f"SELECT id FROM apartments WHERE lawd_cd IN ({placeholders}) LIMIT ?",
                          region_codes + [limit * 2])
            region_ids = [row[0] for row in cursor.fetchall()]
            print(f"[API] Region search done ({len(region_ids)} ids): {time_module.time() - start_time:.3f}s")

        # ID 합치기 (중복 제거)
        all_ids = list(dict.fromkeys(fts_ids + region_ids))[:limit * 2]

        if not all_ids:
            CACHE["search"][cache_key] = []
            return []

        # 상세 정보 조회 (간소화된 쿼리)
        placeholders = ",".join(["?" for _ in all_ids])
        detail_query = f"""
            SELECT
                a.id, a.name, a.dong, a.lawd_cd, a.build_year,
                (SELECT COUNT(*) FROM transactions WHERE apt_id = a.id) as tx_count,
                (SELECT amount FROM transactions WHERE apt_id = a.id ORDER BY deal_date DESC LIMIT 1) as latest_amount,
                (SELECT area FROM transactions WHERE apt_id = a.id ORDER BY deal_date DESC LIMIT 1) as latest_area,
                (SELECT deal_date FROM transactions WHERE apt_id = a.id ORDER BY deal_date DESC LIMIT 1) as latest_date
            FROM apartments a
            WHERE a.id IN ({placeholders})
            ORDER BY tx_count DESC
            LIMIT ?
        """
        cursor.execute(detail_query, all_ids + [limit])
        print(f"[API] Detail query done: {time_module.time() - start_time:.3f}s")

        rows = cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d['region_name'] = get_region_name(d.get('lawd_cd', ''))
            result.append(d)

        # 캐시에 저장
        CACHE["search"][cache_key] = result
        print(f"[API] Search complete (cached): {time_module.time() - start_time:.3f}s")
        return result
    except Exception as e:
        print(f"[API] Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 단지 상세 API ==========
@app.get("/api/apartments/{apt_id}")
async def get_apartment_detail(apt_id: int):
    """단지 기본 정보 + 최근 거래 내역"""
    # 캐시 확인
    cache_key = str(apt_id)
    if cache_key in CACHE["apartment"]:
        return CACHE["apartment"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 단지 기본 정보
        cursor.execute("""
            SELECT * FROM apartments WHERE id = ?
        """, (apt_id,))
        apt = cursor.fetchone()

        if not apt:
            raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")

        apt_dict = dict(apt)
        apt_dict['region_name'] = get_region_name(apt_dict.get('lawd_cd', ''))

        # 최근 거래 내역 (최근 20건)
        cursor.execute("""
            SELECT t.*, i.summary_text
            FROM transactions t
            LEFT JOIN transaction_insights i ON t.id = i.transaction_id
            WHERE t.apt_id = ?
            ORDER BY t.deal_date DESC
            LIMIT 20
        """, (apt_id,))
        transactions = [dict(row) for row in cursor.fetchall()]

        # 평형별 시세 요약 (최근 거래가 + 최근 3개월 평균 포함)
        cursor.execute("""
            SELECT
                ROUND(area, 0) as area,
                MAX(amount) as max_amount,
                MIN(amount) as min_amount,
                AVG(amount) as avg_amount,
                COUNT(*) as count,
                (SELECT amount FROM transactions t2
                 WHERE t2.apt_id = ? AND ROUND(t2.area, 0) = ROUND(t.area, 0)
                 ORDER BY t2.deal_date DESC LIMIT 1) as latest_amount,
                (SELECT deal_date FROM transactions t2
                 WHERE t2.apt_id = ? AND ROUND(t2.area, 0) = ROUND(t.area, 0)
                 ORDER BY t2.deal_date DESC LIMIT 1) as latest_date,
                (SELECT ROUND(AVG(amount), 0) FROM transactions t2
                 WHERE t2.apt_id = ? AND ROUND(t2.area, 0) = ROUND(t.area, 0)
                 AND t2.deal_date >= date('now', '-3 months')) as recent_avg
            FROM transactions t
            WHERE apt_id = ?
            GROUP BY ROUND(area, 0)
            ORDER BY area
        """, (apt_id, apt_id, apt_id, apt_id,))
        area_stats = [dict(row) for row in cursor.fetchall()]

        result = {
            "apartment": apt_dict,
            "transactions": transactions,
            "area_stats": area_stats
        }
        # 캐시에 저장
        CACHE["apartment"][cache_key] = result
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/apartments/{apt_id}/transactions")
async def get_apartment_transactions(
    apt_id: int,
    limit: int = 20,
    offset: int = 0,
    area: Optional[float] = None
):
    """거래 내역 페이징 API"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # area 필터 조건
        area_condition = ""
        params = [apt_id]

        if area:
            area_condition = "AND t.area BETWEEN ? AND ?"
            params.extend([area - 2, area + 2])

        # 전체 개수
        count_query = f"""
            SELECT COUNT(*) FROM transactions t
            WHERE t.apt_id = ? {area_condition}
        """
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]

        # 거래 내역
        params.extend([limit, offset])
        query = f"""
            SELECT t.*, i.summary_text
            FROM transactions t
            LEFT JOIN transaction_insights i ON t.id = i.transaction_id
            WHERE t.apt_id = ? {area_condition}
            ORDER BY t.deal_date DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, params)
        transactions = [dict(row) for row in cursor.fetchall()]

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "transactions": transactions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/apartments/{apt_id}/history")
async def get_apartment_history(apt_id: int, months: int = 240, area: Optional[float] = None):
    """거래 이력 (차트용) - 월별 평균가. area 파라미터로 평형 필터 가능. 기본 240개월(20년)"""
    # 캐시 확인
    cache_key = f"{apt_id}:{months}:{area}"
    if cache_key in CACHE["history"]:
        return CACHE["history"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()

    # area 필터 조건 추가
    area_condition = ""
    params = [apt_id, -months]

    if area:
        # ±2㎡ 범위로 필터링 (같은 평형 그룹)
        area_condition = "AND area BETWEEN ? AND ?"
        params.extend([area - 2, area + 2])

    query = f"""
        SELECT
            strftime('%Y-%m', deal_date) as month,
            ROUND(AVG(amount), 0) as avg_amount,
            COUNT(*) as count,
            ROUND(AVG(area), 1) as avg_area
        FROM transactions
        WHERE apt_id = ?
          AND deal_date >= date('now', ? || ' months')
          {area_condition}
        GROUP BY strftime('%Y-%m', deal_date)
        ORDER BY month
    """

    try:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        result = [dict(row) for row in rows]
        # 캐시에 저장
        CACHE["history"][cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 비교 API ==========
@app.get("/api/compare")
async def compare_apartments(apt_ids: str):
    """두 단지 비교 데이터 (apt_ids: "1,2" 형태)"""
    try:
        ids = [int(x.strip()) for x in apt_ids.split(",")]
    except:
        raise HTTPException(status_code=400, detail="apt_ids 형식이 올바르지 않습니다 (예: 1,2)")

    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="비교할 단지를 2개 이상 선택해주세요")

    conn = get_db_connection()
    cursor = conn.cursor()

    results = []
    try:
        for apt_id in ids[:2]:  # 최대 2개만
            # 단지 정보
            cursor.execute("SELECT * FROM apartments WHERE id = ?", (apt_id,))
            apt = cursor.fetchone()
            if not apt:
                continue

            apt_dict = dict(apt)

            # 최근 거래
            cursor.execute("""
                SELECT amount, area, deal_date, floor
                FROM transactions
                WHERE apt_id = ?
                ORDER BY deal_date DESC
                LIMIT 1
            """, (apt_id,))
            latest = cursor.fetchone()

            # 전고점
            cursor.execute("""
                SELECT MAX(amount) as peak FROM transactions WHERE apt_id = ?
            """, (apt_id,))
            peak = cursor.fetchone()

            # 거래 건수
            cursor.execute("""
                SELECT COUNT(*) as count FROM transactions WHERE apt_id = ?
            """, (apt_id,))
            count = cursor.fetchone()

            results.append({
                "apartment": apt_dict,
                "latest_transaction": dict(latest) if latest else None,
                "peak_amount": peak["peak"] if peak else None,
                "transaction_count": count["count"] if count else 0
            })

        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 모니터링 API ==========
import re
import os

def parse_collection_progress(log_file):
    """로그 파일에서 수집 진행률 파싱"""
    if not os.path.exists(log_file):
        return None
    try:
        with open(log_file, 'r') as f:
            lines = f.readlines()
        # 마지막 진행 상황 찾기 [N/77]
        for line in reversed(lines):
            match = re.search(r'\[(\d+)/(\d+)\].*?:\s*\+[\d,]+건\s*\(누적:\s*([\d,]+)건\)', line)
            if match:
                return {
                    "current": int(match.group(1)),
                    "total": int(match.group(2)),
                    "accumulated": int(match.group(3).replace(',', ''))
                }
    except:
        pass
    return None

@app.get("/api/monitor")
async def get_monitor_stats():
    """데이터 수집 모니터링 통계"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 총 거래 수
        cursor.execute("SELECT COUNT(*) FROM transactions")
        total_transactions = cursor.fetchone()[0]

        # 총 아파트 수
        cursor.execute("SELECT COUNT(*) FROM apartments")
        total_apartments = cursor.fetchone()[0]

        # 지역별 통계
        cursor.execute("""
            SELECT a.lawd_cd, COUNT(DISTINCT a.id) as apt_count, COUNT(t.id) as tx_count
            FROM apartments a
            LEFT JOIN transactions t ON a.id = t.apt_id
            GROUP BY a.lawd_cd
            ORDER BY tx_count DESC
        """)
        regions = [dict(row) for row in cursor.fetchall()]

        # 최근 거래일별 통계
        cursor.execute("""
            SELECT deal_date, COUNT(*) as count
            FROM transactions
            GROUP BY deal_date
            ORDER BY deal_date DESC
            LIMIT 14
        """)
        daily_stats = [dict(row) for row in cursor.fetchall()]

        # 연도별 통계
        cursor.execute("""
            SELECT strftime('%Y', deal_date) as year, COUNT(*) as count
            FROM transactions
            GROUP BY strftime('%Y', deal_date)
            ORDER BY year
        """)
        yearly_stats = [dict(row) for row in cursor.fetchall()]

        # 데이터 범위
        cursor.execute("SELECT MIN(deal_date), MAX(deal_date) FROM transactions")
        date_range = cursor.fetchone()

        # 수집 진행률 파싱
        collection_progress = {
            "2011_2026": parse_collection_progress("collect_all.log"),
            "2006_2010": parse_collection_progress("collect_2006_2010.log")
        }

        return {
            "total_transactions": total_transactions,
            "total_apartments": total_apartments,
            "total_regions": len(regions),
            "regions": regions,
            "daily_stats": daily_stats,
            "yearly_stats": yearly_stats,
            "date_range": {
                "min": date_range[0],
                "max": date_range[1]
            },
            "collection_progress": collection_progress
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 진행 상황 API ==========
PROGRESS_FILE = "progress.json"

@app.get("/api/progress")
async def get_collection_progress():
    """수집 진행 상황 (progress.json) 반환"""
    if not os.path.exists(PROGRESS_FILE):
        return {
            "completed": [],
            "failed": [],
            "current": None,
            "stats": {"total_saved": 0},
            "summary": {
                "completed_count": 0,
                "failed_count": 0,
                "total_expected": 18798,  # 78 regions * 241 months
                "progress_percent": 0
            }
        }

    try:
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            progress = json.load(f)

        completed_count = len(progress.get("completed", []))
        failed_count = len(progress.get("failed", []))
        total_expected = 18798  # 78 * 241

        progress["summary"] = {
            "completed_count": completed_count,
            "failed_count": failed_count,
            "total_expected": total_expected,
            "progress_percent": round((completed_count / total_expected) * 100, 1) if total_expected > 0 else 0
        }
        return progress
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 지역 탐색 API ==========
@app.get("/api/regions/hierarchy")
async def get_region_hierarchy():
    """지역 계층 구조 반환 (시/도 > 구/군)"""
    # 캐시 확인
    cache_key = "all"
    if cache_key in CACHE["hierarchy"]:
        return CACHE["hierarchy"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        result = {}
        for city, districts in REGION_HIERARCHY.items():
            result[city] = []
            for code, name in districts.items():
                # 해당 지역의 아파트/거래 수 조회
                cursor.execute("""
                    SELECT COUNT(DISTINCT a.id) as apt_count, COUNT(t.id) as tx_count
                    FROM apartments a
                    LEFT JOIN transactions t ON a.id = t.apt_id
                    WHERE a.lawd_cd = ?
                """, (code,))
                row = cursor.fetchone()
                result[city].append({
                    "code": code,
                    "name": name,
                    "apt_count": row["apt_count"] if row else 0,
                    "tx_count": row["tx_count"] if row else 0
                })
            # 거래 수 기준 정렬
            result[city].sort(key=lambda x: x["tx_count"], reverse=True)
        # 캐시에 저장
        CACHE["hierarchy"][cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/regions/{lawd_cd}/apartments")
async def get_region_apartments(lawd_cd: str, limit: int = 50, offset: int = 0, sort: str = "tx_count"):
    """특정 지역의 아파트 목록 반환"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 정렬 옵션
    sort_options = {
        "tx_count": "tx_count DESC",
        "latest_amount": "latest_amount DESC",
        "name": "a.name ASC"
    }
    order_by = sort_options.get(sort, "tx_count DESC")

    query = f"""
        SELECT
            a.id,
            a.name,
            a.dong,
            a.jibun,
            a.build_year,
            COUNT(t.id) as tx_count,
            MAX(t.amount) as max_amount,
            (SELECT amount FROM transactions WHERE apt_id = a.id ORDER BY deal_date DESC LIMIT 1) as latest_amount,
            (SELECT area FROM transactions WHERE apt_id = a.id ORDER BY deal_date DESC LIMIT 1) as latest_area,
            (SELECT deal_date FROM transactions WHERE apt_id = a.id ORDER BY deal_date DESC LIMIT 1) as latest_date
        FROM apartments a
        LEFT JOIN transactions t ON a.id = t.apt_id
        WHERE a.lawd_cd = ?
        GROUP BY a.id
        HAVING tx_count > 0
        ORDER BY {order_by}
        LIMIT ? OFFSET ?
    """

    try:
        cursor.execute(query, (lawd_cd, limit, offset))
        apartments = [dict(row) for row in cursor.fetchall()]

        # 총 개수
        cursor.execute("""
            SELECT COUNT(DISTINCT a.id) as total
            FROM apartments a
            JOIN transactions t ON a.id = t.apt_id
            WHERE a.lawd_cd = ?
        """, (lawd_cd,))
        total = cursor.fetchone()["total"]

        # 지역명 찾기
        region_name = None
        for city, districts in REGION_HIERARCHY.items():
            if lawd_cd in districts:
                region_name = f"{city} {districts[lawd_cd]}"
                break

        return {
            "region_code": lawd_cd,
            "region_name": region_name,
            "total": total,
            "apartments": apartments
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/regions/{lawd_cd}/stats")
async def get_region_stats(lawd_cd: str):
    """특정 지역의 통계 정보"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 기본 통계
        cursor.execute("""
            SELECT
                COUNT(DISTINCT a.id) as apt_count,
                COUNT(t.id) as tx_count,
                AVG(t.amount) as avg_amount,
                MAX(t.amount) as max_amount,
                MIN(t.deal_date) as min_date,
                MAX(t.deal_date) as max_date
            FROM apartments a
            LEFT JOIN transactions t ON a.id = t.apt_id
            WHERE a.lawd_cd = ?
        """, (lawd_cd,))
        stats = dict(cursor.fetchone())

        # 최근 거래 5건
        cursor.execute("""
            SELECT t.*, a.name as apt_name, a.dong
            FROM transactions t
            JOIN apartments a ON t.apt_id = a.id
            WHERE a.lawd_cd = ?
            ORDER BY t.deal_date DESC
            LIMIT 5
        """, (lawd_cd,))
        recent = [dict(row) for row in cursor.fetchall()]

        # 지역명
        region_name = None
        for city, districts in REGION_HIERARCHY.items():
            if lawd_cd in districts:
                region_name = f"{city} {districts[lawd_cd]}"
                break

        return {
            "region_code": lawd_cd,
            "region_name": region_name,
            "stats": stats,
            "recent_transactions": recent
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 지역 통계 API ==========
@app.get("/api/stats/regions")
async def get_region_stats_api():
    """지역별 통계 (평균가, 거래량, 전년비)"""
    # 캐시 확인
    cache_key = "all"
    if cache_key in CACHE["stats_regions"]:
        return CACHE["stats_regions"][cache_key]

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        regions_data = []

        for city, districts in REGION_HIERARCHY.items():
            for code, name in districts.items():
                # 해당 지역 통계
                cursor.execute("""
                    SELECT
                        COUNT(*) as tx_count,
                        ROUND(AVG(t.amount), 0) as avg_price,
                        COUNT(DISTINCT a.id) as apt_count
                    FROM transactions t
                    JOIN apartments a ON t.apt_id = a.id
                    WHERE a.lawd_cd = ?
                """, (code,))
                row = cursor.fetchone()

                # 최근 1년 평균가
                cursor.execute("""
                    SELECT ROUND(AVG(t.amount), 0) as recent_avg
                    FROM transactions t
                    JOIN apartments a ON t.apt_id = a.id
                    WHERE a.lawd_cd = ? AND t.deal_date >= date('now', '-1 year')
                """, (code,))
                recent = cursor.fetchone()

                # 전년도 같은 기간 평균가 (1~2년 전)
                cursor.execute("""
                    SELECT ROUND(AVG(t.amount), 0) as prev_avg
                    FROM transactions t
                    JOIN apartments a ON t.apt_id = a.id
                    WHERE a.lawd_cd = ?
                      AND t.deal_date >= date('now', '-2 year')
                      AND t.deal_date < date('now', '-1 year')
                """, (code,))
                prev = cursor.fetchone()

                # 전년비 계산
                yoy_change = None
                if recent['recent_avg'] and prev['prev_avg'] and prev['prev_avg'] > 0:
                    yoy_change = round((recent['recent_avg'] / prev['prev_avg'] - 1) * 100, 1)

                regions_data.append({
                    "code": code,
                    "name": name,
                    "city": city,
                    "avg_price": row['avg_price'] or 0,
                    "tx_count": row['tx_count'] or 0,
                    "apt_count": row['apt_count'] or 0,
                    "yoy_change": yoy_change
                })

        # 시도별 평균가 계산
        cursor.execute("""
            SELECT ROUND(AVG(t.amount), 0) as avg
            FROM transactions t
            JOIN apartments a ON t.apt_id = a.id
            WHERE a.lawd_cd LIKE '11%' AND t.deal_date >= date('now', '-1 year')
        """)
        seoul_avg = cursor.fetchone()['avg'] or 0

        cursor.execute("""
            SELECT ROUND(AVG(t.amount), 0) as avg
            FROM transactions t
            JOIN apartments a ON t.apt_id = a.id
            WHERE a.lawd_cd LIKE '41%' AND t.deal_date >= date('now', '-1 year')
        """)
        gyeonggi_avg = cursor.fetchone()['avg'] or 0

        cursor.execute("""
            SELECT ROUND(AVG(t.amount), 0) as avg
            FROM transactions t
            JOIN apartments a ON t.apt_id = a.id
            WHERE a.lawd_cd LIKE '28%' AND t.deal_date >= date('now', '-1 year')
        """)
        incheon_avg = cursor.fetchone()['avg'] or 0

        # 정렬 (거래량 순)
        regions_data.sort(key=lambda x: x['tx_count'], reverse=True)

        result = {
            "regions": regions_data,
            "summary": {
                "seoul_avg": seoul_avg,
                "gyeonggi_avg": gyeonggi_avg,
                "incheon_avg": incheon_avg
            }
        }
        # 캐시에 저장
        CACHE["stats_regions"][cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ========== 캐시 관리 API ==========
@app.post("/api/cache/clear")
async def clear_cache(secret: str = ""):
    """수집 완료 시 캐시 무효화 (간단한 보안)"""
    if secret != "수집완료":
        raise HTTPException(status_code=403, detail="Invalid secret")
    clear_all_cache()
    return {"status": "cleared", "time": time_module.time()}


@app.get("/api/cache/stats")
async def cache_stats():
    """캐시 통계 반환 (디버깅용)"""
    return {
        "stats": get_cache_stats(),
        "time": time_module.time()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
