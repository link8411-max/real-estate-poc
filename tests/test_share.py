from __future__ import annotations

from datetime import date

from pipeline.area_class import area_class_map
from pipeline.share import share_info

TODAY = date(2026, 11, 7)
_seq = iter(range(1, 10_000))


def _row(amount, deal_date, area=84.97, floor=7, cancel=None, gbn="중개거래", id=None):
    return {"id": id if id is not None else next(_seq), "area": area, "floor": floor, "amount": amount,
            "deal_date": deal_date, "cancel_date": cancel, "dealing_gbn": gbn}


def _run(rows):
    from collections import Counter
    classes = area_class_map(Counter(r["area"] for r in rows).items())
    return share_info(rows, classes, TODAY)


def test_high_badge():
    new = _row(100000, "2026-11-01")
    out = _run([_row(90000, "2026-03-01"), _row(80000, "2026-06-01"), new])
    s = out[new["id"]]
    assert (s["badge"], s["base"], s["diff"], s["pct"]) == ("high", 90000, 10000, 11.1)
    assert s["shareable"] is True and s["held"] is False


def test_up_badge():
    new = _row(95000, "2026-11-01")
    out = _run([_row(120000, "2026-03-01"), _row(90000, "2026-10-20"), new])
    s = out[new["id"]]
    assert (s["badge"], s["base"], s["diff"]) == ("up", 90000, 5000)
    assert s["shareable"] is True


def test_up_compares_latest_prior_by_largest_id():
    a, b = _row(95000, "2026-10-20", id=500), _row(90000, "2026-10-20", id=501)
    new = _row(92000, "2026-11-01", id=502)
    out = _run([_row(120000, "2026-03-01", id=499), a, b, new])
    assert out[new["id"]]["badge"] == "up" and out[new["id"]]["base"] == 90000


def test_high_and_up_is_high():
    new = _row(100000, "2026-11-01")
    out = _run([_row(90000, "2026-03-01"), _row(85000, "2026-10-20"), new])
    assert out[new["id"]]["badge"] == "high"


def test_same_day_not_compared():
    a, b = _row(80000, "2026-11-01", floor=3), _row(90000, "2026-11-01", floor=9)
    assert _run([a, b]) == {}


def test_outside_30_days():
    old = _row(100000, "2026-10-07")  # 11-07 기준 31일 전
    edge = _row(110000, "2026-10-08")  # 30일 전: 대상
    out = _run([_row(90000, "2026-03-01"), old, edge])
    assert old["id"] not in out
    assert out[edge["id"]]["badge"] == "high"


def test_canceled_excluded():
    canceled_prev = _row(110000, "2026-05-01", cancel="2026-05-20")
    canceled_new = _row(130000, "2026-11-02", cancel="2026-11-05")
    new = _row(100000, "2026-11-01")
    out = _run([_row(90000, "2026-03-01"), canceled_prev, canceled_new, new])
    assert out[new["id"]]["badge"] == "high" and out[new["id"]]["base"] == 90000
    assert canceled_new["id"] not in out and canceled_prev["id"] not in out


def test_not_current_max_not_shareable():
    first = _row(100000, "2026-11-01")
    second = _row(110000, "2026-11-03")
    out = _run([_row(90000, "2026-03-01"), first, second])
    assert out[first["id"]]["badge"] == "high" and out[first["id"]]["shareable"] is False
    assert out[second["id"]]["shareable"] is True


def test_correction_held():
    a = _row(100000, "2026-11-01", floor=7)
    b = _row(105000, "2026-11-01", floor=7)
    out = _run([_row(90000, "2026-03-01"), a, b])
    assert out[a["id"]]["held"] is True and out[a["id"]]["shareable"] is False
    assert out[b["id"]]["held"] is True and out[b["id"]]["shareable"] is False


def test_direct_still_badged():
    new = _row(100000, "2026-11-01", gbn="직거래")
    out = _run([_row(90000, "2026-03-01"), new])
    assert out[new["id"]]["badge"] == "high" and out[new["id"]]["shareable"] is True


def test_boundary_areas_same_group():
    new = _row(100000, "2026-11-01", area=84.97)
    out = _run([_row(90000, "2026-03-01", area=85.01), new])
    assert out[new["id"]]["badge"] == "high" and out[new["id"]]["base"] == 90000


def test_other_group_not_compared():
    new = _row(60000, "2026-11-01", area=59.9)
    assert _run([_row(90000, "2026-03-01", area=84.97), new]) == {}
