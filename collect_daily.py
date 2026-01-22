#!/usr/bin/env python3
"""
일일 수집 스크립트 (GitHub Actions용)
- 당월 + 전월만 수집 (78지역 × 2개월 = 156 API 호출)
- 중복은 unique_hash로 자동 제거
- 수집 완료 후 캐시 무효화
"""

import requests
import xml.etree.ElementTree as ET
import sqlite3
import time
import random
import os
from datetime import datetime, timedelta
from insight_engine import generate_deal_hash, analyze_transaction

# 설정 (환경변수 우선)
DB_PATH = os.environ.get("DB_PATH", "real_estate.db")
API_KEY = os.environ.get("MOLIT_API_KEY", "f66a6c1920c0ba414d04b64772a4f5dbba208cfaf208374eed8c3e0f2f14ac14")
API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000")  # 캐시 무효화용
BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"

# API 설정
TIMEOUT = 30
MAX_RETRIES = 3
API_DELAY = 0.5  # GitHub Actions에서는 여유있게

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
    print(f"[{timestamp}] {message}")


def exponential_backoff(attempt, base=2, max_wait=30):
    """지수 백오프 대기 시간 계산"""
    return min(base ** attempt + random.uniform(0, 1), max_wait)


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
                log(f"  429 Too Many Requests - {wait:.1f}초 대기 후 재시도")
                time.sleep(wait)
            elif response.status_code == 502:
                wait = exponential_backoff(attempt)
                log(f"  502 Bad Gateway - {wait:.1f}초 대기 후 재시도")
                time.sleep(wait)
            else:
                return [], f"HTTP {response.status_code}"

        except requests.exceptions.Timeout:
            wait = exponential_backoff(attempt)
            log(f"  Timeout - {wait:.1f}초 대기 후 재시도")
            time.sleep(wait)
        except requests.exceptions.ConnectionError:
            wait = exponential_backoff(attempt)
            log(f"  Connection Error - {wait:.1f}초 대기 후 재시도")
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
    """DB에 저장 (중복은 unique_hash로 자동 제거)"""
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

            # 실거래 데이터 저장 (unique_hash로 중복 방지)
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


def notify_cache_clear():
    """API 서버 캐시 무효화"""
    try:
        response = requests.post(
            f"{API_URL}/api/cache/clear",
            params={"secret": "수집완료"},
            timeout=5
        )
        if response.status_code == 200:
            log("캐시 무효화 완료")
        else:
            log(f"캐시 무효화 실패: HTTP {response.status_code}")
    except Exception as e:
        log(f"캐시 무효화 실패 (서버 꺼져있음): {e}")


def get_target_months():
    """수집 대상 월 반환 (당월 + 전월)"""
    now = datetime.now()
    current = now.strftime("%Y%m")

    # 전월 계산
    first_of_month = now.replace(day=1)
    prev_month = first_of_month - timedelta(days=1)
    previous = prev_month.strftime("%Y%m")

    return [previous, current]


def main():
    log("=== 일일 수집 시작 ===")

    target_months = get_target_months()
    log(f"대상 월: {target_months}")

    total_saved = 0
    total_fetched = 0
    failed_count = 0

    for deal_ymd in target_months:
        log(f"--- {deal_ymd} 수집 중 ---")

        for lawd_cd, region_name in REGIONS.items():
            items, error = fetch_data_with_retry(lawd_cd, deal_ymd)
            time.sleep(API_DELAY)

            if error:
                log(f"  {region_name}: FAILED - {error}")
                failed_count += 1
                continue

            total_fetched += len(items)

            if items:
                saved = save_to_db(lawd_cd, items)
                total_saved += saved
                if saved > 0:
                    log(f"  {region_name}: +{saved}건 (전체 {len(items)}건 중 신규)")
            else:
                # 데이터 없는 경우 로그 생략 (너무 많음)
                pass

    log("=== 수집 완료 ===")
    log(f"총 조회: {total_fetched}건, 신규 저장: {total_saved}건, 실패: {failed_count}개 지역")

    # 신규 데이터가 있으면 캐시 무효화
    if total_saved > 0:
        notify_cache_clear()

    return total_saved


if __name__ == "__main__":
    main()
