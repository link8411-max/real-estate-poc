import json
import time
from datetime import datetime
from collector_core import MolitCollector

class SudogwonTaskScheduler:
    def __init__(self, region_file, service_key=None):
        self.collector = MolitCollector(service_key)  # 기본 API 키 사용
        with open(region_file, 'r', encoding='utf-8') as f:
            self.regions = json.load(f)
        
    def get_all_districts(self):
        """서울, 경기, 인천 전체 시군구 코드 리스트 추출"""
        districts = []
        for city, sigungu_map in self.regions.items():
            for code, name in sigungu_map.items():
                districts.append({'code': code, 'name': f"{city} {name}"})
        return districts

    def run_sync_cycle(self):
        """수도권 66개 구 전체 1회 스캔"""
        districts = self.get_all_districts()
        current_month = datetime.now().strftime("%Y%m")
        
        print(f"\n--- Starting Sync Cycle: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
        
        for dist in districts:
            print(f"Collecting: {dist['name']} ({dist['code']})")
            deals = self.collector.fetch_data(dist['code'], current_month)
            if deals:
                saved = self.collector.save_to_db(dist['code'], deals)
                print(f"   Successfully saved {saved} new transactions.")
            time.sleep(0.5) # API 부하 방지용 짧은 딜레이
            
        print(f"--- Cycle Complete: {len(districts)} districts scanned ---")

    def start(self, interval_seconds=600):
        print(f"Starting Sudogwon Insight Scheduler (Interval: {interval_seconds}s)")
        while True:
            try:
                self.run_sync_cycle()
                print(f"Sleeping for {interval_seconds}s...")
                time.sleep(interval_seconds)
            except KeyboardInterrupt:
                print("\nScheduler stopped by user.")
                break
            except Exception as e:
                print(f"Scheduler Error: {e}")
                time.sleep(60) # 에러 시 1분 후 재시도

if __name__ == "__main__":
    REGIONS_JSON = "regions.json"

    scheduler = SudogwonTaskScheduler(REGIONS_JSON)
    print("스케줄러 준비 완료. API 키가 설정되어 있습니다.")
    print(f"수집 대상: {len(scheduler.get_all_districts())}개 시군구")

    # 테스트: 강남구 1개만 수집
    # scheduler.run_sync_cycle()

    # 전체 운영: 10분 주기
    # scheduler.start(interval_seconds=600)
