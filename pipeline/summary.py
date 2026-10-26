from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta, timezone
from typing import Any

from pipeline.regions import city_of

RECENT_DAYS = 90
BARGAIN_MIN_RECENT = 3

AreaStat = dict[str, Any]
RentAreaStat = dict[str, Any]


def _cutoff(today: date) -> str:
    return (today - timedelta(days=RECENT_DAYS)).isoformat()


def trade_area_stats(conn: sqlite3.Connection, apt_id: int, today: date) -> list[AreaStat]:
    """취소되지 않은 매매를 반올림 전용면적(㎡)별로 묶어 시세 요약을 만든다."""
    cutoff = _cutoff(today)
    rows = conn.execute(
        "SELECT CAST(ROUND(area, 0) AS INTEGER) AS grp, amount, deal_date FROM transactions "
        "WHERE apt_id = ? AND cancel_date IS NULL ORDER BY deal_date DESC, id DESC",
        (apt_id,),
    ).fetchall()
    groups: dict[int, list[tuple[int, str]]] = {}
    for grp, amount, deal_date in rows:  # 최신순
        groups.setdefault(grp, []).append((amount, deal_date))
    stats: list[AreaStat] = []
    for grp in sorted(groups):
        deals = groups[grp]
        amounts = [a for a, _ in deals]
        recent = [a for a, d in deals if d >= cutoff]
        peak = max(amounts)
        stats.append({
            "area": grp,
            "count": len(deals),
            "max_amount": peak,
            "min_amount": min(amounts),
            "avg_amount": round(sum(amounts) / len(amounts)),
            "latest_amount": deals[0][0],
            "latest_date": deals[0][1],
            "recent_avg": round(sum(recent) / len(recent)) if recent else None,
            "recent_count": len(recent),
            "peak_date": next(d for a, d in deals if a == peak),  # 동률이면 가장 최근
        })
    return stats


def rent_area_stats(conn: sqlite3.Connection, apt_id: int, today: date) -> list[RentAreaStat]:
    """전세(월세 0)와 월세를 반올림 전용면적별로 묶어 요약한다."""
    cutoff = _cutoff(today)
    rows = conn.execute(
        "SELECT CAST(ROUND(area, 0) AS INTEGER) AS grp, deposit, monthly_rent, deal_date FROM rents "
        "WHERE apt_id = ? ORDER BY deal_date DESC, id DESC",
        (apt_id,),
    ).fetchall()
    groups: dict[int, list[tuple[int, int, str]]] = {}
    for grp, deposit, monthly, deal_date in rows:
        groups.setdefault(grp, []).append((deposit, monthly, deal_date))
    stats: list[RentAreaStat] = []
    for grp in sorted(groups):
        deals = groups[grp]
        recent_jeonse = [dep for dep, m, d in deals if m == 0 and d >= cutoff]
        stats.append({
            "area": grp,
            "jeonse_count": sum(1 for _, m, _ in deals if m == 0),
            "wolse_count": sum(1 for _, m, _ in deals if m > 0),
            "latest_deposit": deals[0][0],
            "latest_monthly_rent": deals[0][1],
            "latest_date": deals[0][2],
            "recent_jeonse_avg": round(sum(recent_jeonse) / len(recent_jeonse)) if recent_jeonse else None,
        })
    return stats


def metrics(trade_stats: list[AreaStat], rent_stats: list[RentAreaStat], today: date) -> dict[str, Any]:
    """최신 거래 평형 기준 배지 지표. 계산할 수 없는 값은 키 자체를 넣지 않는다."""
    if not trade_stats:
        return {}
    latest = max(trade_stats, key=lambda s: s["latest_date"])
    out: dict[str, Any] = {}
    latest_amount, recent_avg = latest["latest_amount"], latest["recent_avg"]

    if recent_avg and latest["recent_count"] >= BARGAIN_MIN_RECENT:
        bargain = latest_amount - recent_avg
        out["bargain_amount"] = int(bargain)
        out["bargain_percent"] = round(bargain / recent_avg * 100, 1)
    if latest["max_amount"]:
        out["recovery_rate"] = round(latest_amount / latest["max_amount"] * 100, 1)
        out["peak_date"] = latest["peak_date"]
    out["days_since_last_tx"] = (today - date.fromisoformat(latest["latest_date"])).days

    rent = next((r for r in rent_stats if r["area"] == latest["area"]), None)
    if rent and rent["recent_jeonse_avg"] is not None and recent_avg:
        out["jeonse_ratio"] = round(rent["recent_jeonse_avg"] / recent_avg * 100, 1)
    return out


def apartment_summary(conn: sqlite3.Connection, apt_id: int, today: date) -> dict[str, Any]:
    apt = conn.execute(
        "SELECT id, name, lawd_cd, dong, jibun, build_year, apt_seq, latitude, longitude "
        "FROM apartments WHERE id = ?",
        (apt_id,),
    ).fetchone()
    trade_stats = trade_area_stats(conn, apt_id, today)
    rent_stats = rent_area_stats(conn, apt_id, today)
    m = metrics(trade_stats, rent_stats, today)
    latest = max(trade_stats, key=lambda s: s["latest_date"]) if trade_stats else None
    jeonse = conn.execute(
        "SELECT deposit, deal_date FROM rents WHERE apt_id = ? AND monthly_rent = 0 "
        "ORDER BY deal_date DESC, id DESC LIMIT 1",
        (apt_id,),
    ).fetchone()
    rent_count = conn.execute("SELECT COUNT(*) FROM rents WHERE apt_id = ?", (apt_id,)).fetchone()[0]
    return {
        "id": apt["id"],
        "name": apt["name"],
        "lawd_cd": apt["lawd_cd"],
        "city": city_of(apt["lawd_cd"]),
        "dong": apt["dong"],
        "jibun": apt["jibun"],
        "build_year": apt["build_year"],
        "apt_seq": apt["apt_seq"],
        "lat": apt["latitude"],
        "lng": apt["longitude"],
        "latest_trade_amount": latest["latest_amount"] if latest else None,
        "latest_trade_date": latest["latest_date"] if latest else None,
        "latest_trade_area": latest["area"] if latest else None,
        "latest_jeonse_deposit": jeonse["deposit"] if jeonse else None,
        "latest_jeonse_date": jeonse["deal_date"] if jeonse else None,
        "trade_count": sum(s["count"] for s in trade_stats),
        "rent_count": rent_count,
        "recent_avg": latest["recent_avg"] if latest else None,
        "peak_amount": max((s["max_amount"] for s in trade_stats), default=None),
        "jeonse_ratio": m.get("jeonse_ratio"),
        "area_stats": trade_stats,
        "rent_area_stats": rent_stats,
        "metrics": m,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
