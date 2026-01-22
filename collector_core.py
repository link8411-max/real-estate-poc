import requests
import xml.etree.ElementTree as ET
import time
import json
import sqlite3
from datetime import datetime
from insight_engine import generate_deal_hash, analyze_transaction

class MolitCollector:
    def __init__(self, service_key=None, db_path="real_estate.db"):
        # API 키: 환경변수 > 파라미터 > 기본값
        self.service_key = service_key or "f66a6c1920c0ba414d04b64772a4f5dbba208cfaf208374eed8c3e0f2f14ac14"
        # 신규 API 엔드포인트 (2024년 이후)
        self.base_url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
        self.db_path = db_path

    def fetch_data(self, lawd_cd, deal_ymd, num_of_rows=1000):
        """국토부 실거래가 API 호출"""
        params = {
            'serviceKey': self.service_key,
            'LAWD_CD': lawd_cd,
            'DEAL_YMD': deal_ymd,
            'numOfRows': num_of_rows,
            'pageNo': 1,
        }
        
        try:
            response = requests.get(self.base_url, params=params, timeout=30)
            if response.status_code == 200:
                return self.parse_xml(response.text)
            else:
                print(f"Error: API returned {response.status_code}")
                return []
        except Exception as e:
            print(f"Network Error: {e}")
            return []

    def parse_xml(self, xml_data):
        """XML 데이터를 파싱하여 리스트로 반환 (신규 API 구조)"""
        root = ET.fromstring(xml_data)
        items = []

        for item in root.findall('.//item'):
            # 신규 API 필드명 매핑 (2024년 이후)
            data = {
                'apt_name': self._get_text(item, 'aptNm'),
                'amount': self._get_text(item, 'dealAmount').replace(',', ''),
                'year_built': self._get_text(item, 'buildYear'),
                'deal_year': self._get_text(item, 'dealYear'),
                'deal_month': self._get_text(item, 'dealMonth'),
                'deal_day': self._get_text(item, 'dealDay'),
                'area': self._get_text(item, 'excluUseAr'),
                'floor': self._get_text(item, 'floor') or '0',
                'dong': self._get_text(item, 'umdNm'),
                'jibun': self._get_text(item, 'jibun'),
                'cancel_date': self._get_text(item, 'cdealDay') or None,
                # 추가 정보
                'road_name': self._get_text(item, 'roadNm'),
                'deal_type': self._get_text(item, 'dealingGbn'),
            }
            items.append(data)
        return items

    def _get_text(self, item, tag):
        """XML 엘리먼트에서 텍스트 추출 헬퍼"""
        elem = item.find(tag)
        if elem is not None and elem.text:
            return elem.text.strip()
        return ''

    def save_to_db(self, lawd_cd, items):
        """수집된 데이터를 DB에 저장"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        saved_count = 0
        
        for item in items:
            try:
                # 1. 아파트 정보 저장 또는 가져오기
                cursor.execute("""
                    INSERT OR IGNORE INTO apartments (name, lawd_cd, dong, jibun, build_year)
                    VALUES (?, ?, ?, ?, ?)
                """, (item['apt_name'], lawd_cd, item['dong'], item['jibun'], item['year_built']))
                
                cursor.execute("""
                    SELECT id FROM apartments 
                    WHERE name=? AND lawd_cd=? AND dong=? AND jibun=?
                """, (item['apt_name'], lawd_cd, item['dong'], item['jibun']))
                apt_id = cursor.fetchone()[0]

                # 2. 실거래 데이터 저장 (해시 기반 중복 방지)
                deal_date = f"{item['deal_year']}-{int(item['deal_month']):02d}-{int(item['deal_day']):02d}"
                unique_hash = generate_deal_hash(item['apt_name'], item['floor'], item['area'], deal_date, item['amount'])
                
                cursor.execute("""
                    INSERT OR IGNORE INTO transactions (apt_id, amount, area, floor, deal_date, unique_hash, cancel_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (apt_id, int(item['amount']), float(item['area']), int(item['floor']), deal_date, unique_hash, item['cancel_date']))
                
                if cursor.rowcount > 0:
                    trans_id = cursor.lastrowid
                    # 3. 인사이트 생성 및 저장
                    summary = analyze_transaction(item)
                    cursor.execute("""
                        INSERT OR REPLACE INTO transaction_insights (transaction_id, summary_text)
                        VALUES (?, ?)
                    """, (trans_id, summary))
                    saved_count += 1
            
            except Exception as e:
                print(f"DB Error for {item['apt_name']}: {e}")
                continue
                
        conn.commit()
        conn.close()
        return saved_count

if __name__ == "__main__":
    # API 키가 기본값으로 설정되어 있음
    collector = MolitCollector()
    print("MolitCollector with DB support ready.")
    print(f"API URL: {collector.base_url}")
