#!/usr/bin/env python3
"""스마트 수집 스크립트 - 실패 재시도 + 진행상황 저장"""

from collector_core import MolitCollector
import json
import time
import sys
import os

PROGRESS_FILE = "collect_progress.json"

def load_progress():
    """진행 상황 로드"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {"completed": [], "failed": []}

def save_progress(progress):
    """진행 상황 저장"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)

def main():
    # 시작/끝 연도 인자 (기본: 2006-2026)
    start_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2006
    end_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    collector = MolitCollector()
    progress = load_progress()

    with open('regions.json', 'r') as f:
        data = json.load(f)

    all_regions = []
    for area, regions in data.items():
        for code, name in regions.items():
            all_regions.append((code, name, area))

    # 수집할 월 목록
    months = []
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            if year == 2026 and month > 1:
                continue
            months.append(f'{year}{month:02d}')

    # 전체 작업 목록 생성
    all_tasks = []
    for code, name, area in all_regions:
        for month in months:
            task_key = f"{code}_{month}"
            if task_key not in progress["completed"]:
                all_tasks.append((code, name, area, month, task_key))

    print(f'=== 스마트 수집 시작 ===')
    print(f'기간: {start_year}년 ~ {end_year}년')
    print(f'총 작업: {len(all_tasks)}개 (이미 완료: {len(progress["completed"])}개)')
    print(f'실패 재시도: {len(progress["failed"])}개')
    print('=' * 50)
    sys.stdout.flush()

    # 실패한 것 먼저 재시도
    retry_tasks = [t for t in all_tasks if t[4] in progress["failed"]]
    normal_tasks = [t for t in all_tasks if t[4] not in progress["failed"]]

    total_new = 0
    failed_count = 0

    for idx, (code, name, area, month, task_key) in enumerate(retry_tasks + normal_tasks):
        retries = 3
        success = False

        while retries > 0 and not success:
            try:
                items = collector.fetch_data(code, month, num_of_rows=1000)
                if items:
                    count = collector.save_to_db(code, items)
                    total_new += count

                # 성공
                progress["completed"].append(task_key)
                if task_key in progress["failed"]:
                    progress["failed"].remove(task_key)
                success = True

            except Exception as e:
                retries -= 1
                if retries > 0:
                    time.sleep(2)  # 재시도 전 대기
                else:
                    # 최종 실패
                    if task_key not in progress["failed"]:
                        progress["failed"].append(task_key)
                    failed_count += 1
                    print(f'실패: {area} {name} {month}')

        # 진행상황 주기적 저장 (100개마다)
        if (idx + 1) % 100 == 0:
            save_progress(progress)
            done = len(progress["completed"])
            total = done + len(retry_tasks) + len(normal_tasks) - idx - 1
            pct = round(done / (done + len(normal_tasks) + len(retry_tasks)) * 100)
            print(f'[{pct}%] 완료: {done}개 / 신규: +{total_new}건 / 실패: {failed_count}개')
            sys.stdout.flush()

        time.sleep(0.2)  # API 부하 방지

    # 최종 저장
    save_progress(progress)

    print('=' * 50)
    print(f'완료! 신규: +{total_new}건')
    print(f'성공: {len(progress["completed"])}개 / 실패: {len(progress["failed"])}개')

    if progress["failed"]:
        print(f'실패 목록은 {PROGRESS_FILE}에 저장됨. 다시 실행하면 재시도.')

if __name__ == '__main__':
    main()
