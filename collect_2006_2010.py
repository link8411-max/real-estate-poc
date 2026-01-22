#!/usr/bin/env python3
"""2006~2010년 데이터 수집 스크립트"""

from collector_core import MolitCollector
import json
import time
import sys

def main():
    collector = MolitCollector()

    with open('regions.json', 'r') as f:
        data = json.load(f)

    # 모든 지역 코드
    all_regions = []
    for area, regions in data.items():
        for code, name in regions.items():
            all_regions.append((code, name, area))

    print(f'총 {len(all_regions)}개 지역')

    # 2006년 1월 ~ 2010년 12월
    months = []
    for year in range(2006, 2011):
        for month in range(1, 13):
            months.append(f'{year}{month:02d}')

    print(f'수집 기간: {months[0]} ~ {months[-1]} ({len(months)}개월)')
    print(f'예상 API 호출: {len(all_regions) * len(months):,}회')
    print('=' * 50)
    sys.stdout.flush()

    total = 0
    for i, (code, name, area) in enumerate(all_regions):
        region_total = 0
        for month in months:
            try:
                items = collector.fetch_data(code, month, num_of_rows=1000)
                if items:
                    count = collector.save_to_db(code, items)
                    region_total += count
                    total += count
                time.sleep(0.15)
            except Exception as e:
                pass

        print(f'[{i+1}/{len(all_regions)}] {area} {name}: +{region_total:,}건 (누적: {total:,}건)')
        sys.stdout.flush()

    print('=' * 50)
    print(f'수집 완료! 총 {total:,}건 추가')

if __name__ == '__main__':
    main()
