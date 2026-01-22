#!/usr/bin/env python3
"""
개선된 부동산 실거래가 수집 스크립트
- 지수 백오프 재시도 (5회, 2→4→8→16→32초)
- 타임아웃 30초
- API 호출 간격 0.1초
- 병렬 처리 (3개 워커)
- progress.json으로 진행 상황 저장/복구
"""

import requests
import xml.etree.ElementTree as ET
import sqlite3
import json
import time
import random
import sys
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from insight_engine import generate_deal_hash, analyze_transaction

# 설정
DB_PATH = "real_estate.db"
PROGRESS_FILE = "progress.json"
LOG_FILE = "collect_robust.log"
API_KEY = "f66a6c1920c0ba414d04b64772a4f5dbba208cfaf208374eed8c3e0f2f14ac14"
BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"

# 개선된 설정값
TIMEOUT = 30  # 30초
MAX_RETRIES = 5  # 5회 재시도
API_DELAY = 0.3  # 0.3초 간격
NUM_WORKERS = 5  # 병렬 워커 수

# 동기화용 락
progress_lock = threading.Lock()
log_lock = threading.Lock()
db_lock = threading.Lock()

# 78개 지역 코드
REGIONS = {
    # 서울 25개구
    "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구",
    "11215": "광진구", "11230": "동대문구", "11260": "중랑구", "11290": "성북구",
    "11305": "강북구", "11320": "도봉구", "11350": "노원구", "11380": "은평구",
    "11410": "서대문구", "11440": "마포구", "11470": "양천구", "11500": "강서구",
    "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
    "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구",
    "11740": "강동구",
    # 경기 43개 시/구
    "41111": "수원장안", "41113": "수원권선", "41115": "수원영통", "41117": "수원팔달",
    "41131": "성남수정", "41133": "성남중원", "41135": "성남분당", "41150": "의정부",
    "41171": "안양만안", "41173": "안양동안", "41190": "부천", "41210": "광명",
    "41220": "평택", "41250": "동두천", "41271": "안산상록", "41273": "안산단원",
    "41281": "고양덕양", "41285": "고양일산동", "41287": "고양일산서", "41290": "과천",
    "41310": "구리", "41360": "남양주", "41370": "오산", "41390": "시흥",
    "41410": "군포", "41430": "의왕", "41450": "하남", "41461": "용인처인",
    "41463": "용인기흥", "41465": "용인수지", "41480": "파주", "41500": "이천",
    "41550": "안성", "41570": "김포", "41590": "화성", "41610": "광주",
    "41630": "양주", "41650": "포천", "41670": "여주", "41800": "연천",
    "41820": "가평", "41830": "양평",
    # 인천 10개 구/군
    "28110": "인천중구", "28140": "인천동구", "28177": "미추홀", "28185": "연수구",
    "28200": "남동구", "28237": "부평구", "28245": "계양구", "28260": "인천서구",
    "28710": "강화군", "28720": "옹진군",
}


def log(message):
    """타임스탬프 포함 로깅"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {message}"
    with log_lock:
        print(line)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def exponential_backoff(attempt, base=2, max_wait=60):
    """지수 백오프 대기 시간 계산"""
    wait = min(base ** attempt + random.uniform(0, 1), max_wait)
    return wait


def load_progress():
    """진행 상황 로드"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed": [], "failed": [], "current": None, "stats": {"total_saved": 0}}


def save_progress(progress):
    """진행 상황 저장"""
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def fetch_data_with_retry(lawd_cd, deal_ymd):
    """지수 백오프로 API 호출"""
    params = {
        'serviceKey': API_KEY,
        'LAWD_CD': lawd_cd,
        'DEAL_YMD': deal_ymd,
        'numOfRows': 1000,
        'pageNo': 1,
    }

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(BASE_URL, params=params, timeout=TIMEOUT)

            if response.status_code == 200:
                return parse_xml(response.text), None
            elif response.status_code == 429:
                wait = exponential_backoff(attempt)
                log(f"  429 Too Many Requests - {wait:.1f}초 대기 후 재시도 ({attempt+1}/{MAX_RETRIES})")
                time.sleep(wait)
            elif response.status_code == 502:
                wait = exponential_backoff(attempt)
                log(f"  502 Bad Gateway - {wait:.1f}초 대기 후 재시도 ({attempt+1}/{MAX_RETRIES})")
                time.sleep(wait)
            else:
                return [], f"HTTP {response.status_code}"

        except requests.exceptions.Timeout:
            wait = exponential_backoff(attempt)
            log(f"  Timeout - {wait:.1f}초 대기 후 재시도 ({attempt+1}/{MAX_RETRIES})")
            time.sleep(wait)
        except requests.exceptions.ConnectionError as e:
            wait = exponential_backoff(attempt)
            log(f"  Connection Error - {wait:.1f}초 대기 후 재시도 ({attempt+1}/{MAX_RETRIES})")
            time.sleep(wait)
        except Exception as e:
            return [], str(e)

    return [], f"Max retries ({MAX_RETRIES}) exceeded"


def parse_xml(xml_data):
    """XML 파싱"""
    try:
        root = ET.fromstring(xml_data)
        items = []

        for item in root.findall('.//item'):
            data = {
                'apt_name': get_text(item, 'aptNm'),
                'amount': get_text(item, 'dealAmount').replace(',', ''),
                'year_built': get_text(item, 'buildYear'),
                'deal_year': get_text(item, 'dealYear'),
                'deal_month': get_text(item, 'dealMonth'),
                'deal_day': get_text(item, 'dealDay'),
                'area': get_text(item, 'excluUseAr'),
                'floor': get_text(item, 'floor') or '0',
                'dong': get_text(item, 'umdNm'),
                'jibun': get_text(item, 'jibun'),
                'cancel_date': get_text(item, 'cdealDay') or None,
            }
            if data['apt_name'] and data['amount']:
                items.append(data)
        return items
    except ET.ParseError:
        return []


def get_text(item, tag):
    """XML 텍스트 추출"""
    elem = item.find(tag)
    if elem is not None and elem.text:
        return elem.text.strip()
    return ''


def save_to_db(lawd_cd, items):
    """DB에 저장 (thread-safe)"""
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        saved_count = 0

        for item in items:
            try:
                # 아파트 정보 저장
                cursor.execute("""
                    INSERT OR IGNORE INTO apartments (name, lawd_cd, dong, jibun, build_year)
                    VALUES (?, ?, ?, ?, ?)
                """, (item['apt_name'], lawd_cd, item['dong'], item['jibun'], item['year_built']))

                cursor.execute("""
                    SELECT id FROM apartments
                    WHERE name=? AND lawd_cd=? AND dong=? AND jibun=?
                """, (item['apt_name'], lawd_cd, item['dong'], item['jibun']))
                apt_id = cursor.fetchone()[0]

                # 실거래 데이터 저장
                deal_date = f"{item['deal_year']}-{int(item['deal_month']):02d}-{int(item['deal_day']):02d}"
                unique_hash = generate_deal_hash(item['apt_name'], item['floor'], item['area'], deal_date, item['amount'])

                cursor.execute("""
                    INSERT OR IGNORE INTO transactions (apt_id, amount, area, floor, deal_date, unique_hash, cancel_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (apt_id, int(item['amount']), float(item['area']), int(item['floor']), deal_date, unique_hash, item['cancel_date']))

                if cursor.rowcount > 0:
                    trans_id = cursor.lastrowid
                    summary = analyze_transaction(item)
                    cursor.execute("""
                        INSERT OR REPLACE INTO transaction_insights (transaction_id, summary_text)
                        VALUES (?, ?)
                    """, (trans_id, summary))
                    saved_count += 1
            except Exception as e:
                continue

        conn.commit()
        conn.close()
        return saved_count


def process_task(task_info):
    """단일 작업 처리 (병렬 실행용)"""
    idx, total_tasks, lawd_cd, deal_ymd, progress = task_info
    task_key = f"{lawd_cd}_{deal_ymd}"
    region_name = REGIONS.get(lawd_cd, lawd_cd)

    # API 호출
    items, error = fetch_data_with_retry(lawd_cd, deal_ymd)
    time.sleep(API_DELAY)

    if error:
        log(f"[{idx}/{total_tasks}] {region_name} {deal_ymd}: FAILED - {error}")
        return {"task_key": task_key, "success": False, "error": error, "saved": 0}
    else:
        saved = save_to_db(lawd_cd, items)
        log(f"[{idx}/{total_tasks}] {region_name} {deal_ymd}: +{saved}건")
        return {"task_key": task_key, "success": True, "error": None, "saved": saved}


def generate_tasks(start_year, end_year):
    """수집 작업 목록 생성"""
    tasks = []
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            if year == 2026 and month > 1:  # 2026년은 1월까지만
                break
            deal_ymd = f"{year}{month:02d}"
            for lawd_cd in REGIONS.keys():
                tasks.append((lawd_cd, deal_ymd))
    return tasks


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 collect_robust.py <start_year> <end_year>")
        print("Example: python3 collect_robust.py 2006 2026")
        sys.exit(1)

    start_year = int(sys.argv[1])
    end_year = int(sys.argv[2])

    log(f"=== 수집 시작: {start_year}~{end_year} (병렬 {NUM_WORKERS}개, 딜레이 {API_DELAY}초) ===")

    # 진행 상황 로드
    progress = load_progress()
    completed_set = set(progress["completed"])

    # 이전 실패 항목 재시도
    if progress["failed"]:
        log(f"이전 실패 항목 {len(progress['failed'])}개 재시도...")
        progress["failed"] = []
        save_progress(progress)

    # 작업 목록 생성 (미완료 항목만)
    all_tasks = generate_tasks(start_year, end_year)
    total_tasks = len(all_tasks)
    pending_tasks = []

    for idx, (lawd_cd, deal_ymd) in enumerate(all_tasks, 1):
        task_key = f"{lawd_cd}_{deal_ymd}"
        if task_key not in completed_set:
            pending_tasks.append((idx, total_tasks, lawd_cd, deal_ymd, progress))

    log(f"총 {total_tasks}개 작업 (완료: {len(completed_set)}개, 남은 작업: {len(pending_tasks)}개)")

    # 병렬 수집 실행
    total_saved = progress["stats"]["total_saved"]

    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = {executor.submit(process_task, task): task for task in pending_tasks}

        for future in as_completed(futures):
            result = future.result()

            with progress_lock:
                if result["success"]:
                    progress["completed"].append(result["task_key"])
                    total_saved += result["saved"]
                    progress["stats"]["total_saved"] = total_saved
                else:
                    progress["failed"].append({"task": result["task_key"], "error": result["error"]})

                # 주기적으로 저장 (10개마다)
                if len(progress["completed"]) % 10 == 0:
                    save_progress(progress)

    # 최종 저장
    progress["current"] = None
    save_progress(progress)

    log(f"=== 수집 완료 ===")
    log(f"완료: {len(progress['completed'])}개, 실패: {len(progress['failed'])}개")
    log(f"총 저장: {progress['stats']['total_saved']:,}건")


if __name__ == "__main__":
    main()
