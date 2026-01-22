#!/bin/bash
while true; do
  clear
  echo "=== 데이터 수집 모니터링 ==="
  echo ""
  echo "📊 DB 현황:"
  sqlite3 real_estate.db "SELECT '거래: ' || COUNT(*) || '건' FROM transactions;"
  sqlite3 real_estate.db "SELECT '아파트: ' || COUNT(*) || '개' FROM apartments;"
  echo ""
  echo "📅 최근 거래일:"
  sqlite3 real_estate.db "SELECT deal_date || ' : ' || COUNT(*) || '건' FROM transactions GROUP BY deal_date ORDER BY deal_date DESC LIMIT 5;"
  echo ""
  echo "🔄 수집 진행:"
  tail -3 collect_all.log 2>/dev/null | grep -E "^\[" || echo "로그 없음"
  echo ""
  echo "⏰ $(date '+%H:%M:%S') | Ctrl+C로 종료"
  sleep 5
done
