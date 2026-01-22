import hashlib

def generate_deal_hash(apt_name, floor, area, deal_date, amount):
    """중복 방지를 위한 고유 해시 생성"""
    raw_str = f"{apt_name}|{floor}|{area}|{deal_date}|{amount}"
    return hashlib.md5(raw_str.encode()).hexdigest()

def analyze_transaction(deal, history=None):
    """
    실거래 한 건에 대한 룰 기반 분석 로직
    - deal: 현재 거래 정보 (dict)
    - history: 해당 단지의 과거 거래 기록 (list, optional)
    """
    insights = []
    
    amount = int(deal['amount'].replace(',', ''))
    area = float(deal['area'])
    
    # 1. 전고점 대비 하락폭 (임시 데이터 활용)
    peak_amount = 150000  # 예: 해당 평형 전고점 15억
    if amount < peak_amount:
        drop_pct = round((peak_amount - amount) / peak_amount * 100)
        insights.append(f"📉 전고점 대비 -{drop_pct}% 수준")
    
    # 2. 신고가 여부
    if amount >= peak_amount:
        insights.append("🔥 신고가 경신!")

    # 3. 전세가율 (데이터가 있을 경우)
    if 'jeonse_amount' in deal:
        jeonse = int(deal['jeonse_amount'].replace(',', ''))
        gap_ratio = round(jeonse / amount * 100)
        insights.append(f"💰 전세가율 {gap_ratio}% (갭 {amount - jeonse:,}원)")
        
    return " | ".join(insights) if insights else "평이한 거래"

# 테스트용 가짜 데이터
sample_deal = {
    'apt_name': '잠실 엘스',
    'floor': 15,
    'area': 84.88,
    'deal_date': '2026-01-14',
    'amount': '125,000',
    'jeonse_amount': '95,000'
}

print(f"[{sample_deal['apt_name']}] 분석 결과:")
print(f"거래 요약: {analyze_transaction(sample_deal)}")
