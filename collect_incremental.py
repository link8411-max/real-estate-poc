#!/usr/bin/env python3
"""
증분 데이터 수집 스크립트
- 매일/매주 실행용
- 최근 N개월만 수집 (기본: 2개월)
- 이미 수집된 데이터는 unique_hash로 자동 스킵
"""

from collector_core import MolitCollector
import json
import time
import sys
from datetime import datetime, timedelta

def get_recent_months(n_months=2):
    """최근 N개월 YYYYMM 리스트 반환"""
    months = []
    today = datetime.now()
    for i in range(n_months):
        dt = today - timedelta(days=30 * i)
        months.append(dt.strftime('%Y%m'))
    return sorted(set(months))

def main():
    # 인자로 수집할 개월 수 지정 가능 (기본 2개월)
    n_months = int(sys.argv[1]) if len(sys.argv) > 1 else 2

    collector = MolitCollector()

    with open('regions.json', 'r') as f:
        data = json.load(f)

    # 모든 지역 코드
    all_regions = []
    for area, regions in data.items():
        for code, name in regions.items():
            all_regions.append((code, name, area))

    months = get_recent_months(n_months)

    print(f'=== 증분 수집 시작 ===')
    print(f'대상: {len(all_regions)}개 지역')
    print(f'기간: {months[0]} ~ {months[-1]} ({len(months)}개월)')
    print(f'예상 API 호출: {len(all_regions) * len(months):,}회')
    print('=' * 50)
    sys.stdout.flush()

    total_new = 0
    for i, (code, name, area) in enumerate(all_regions):
        region_new = 0
        for month in months:
            try:
                items = collector.fetch_data(code, month, num_of_rows=1000)
                if items:
                    count = collector.save_to_db(code, items)
                    region_new += count
                    total_new += count
                time.sleep(0.2)  # API 부하 방지
            except Exception as e:
                print(f'Error {area} {name} {month}: {e}')

        if region_new > 0:
            print(f'[{i+1}/{len(all_regions)}] {area} {name}: +{region_new}건 신규')
        sys.stdout.flush()

    print('=' * 50)
    print(f'완료! 신규 {total_new:,}건 추가')
    print(f'실행시간: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')

if __name__ == '__main__':
    main()
