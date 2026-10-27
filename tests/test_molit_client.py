from __future__ import annotations

from pathlib import Path

import pytest
import requests

from pipeline import molit_client
from pipeline.molit_client import (
    MolitError,
    fetch_rents,
    fetch_trades,
    parse_rent_xml,
    parse_trade_xml,
)

FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakeResponse:
    def __init__(self, status_code: int = 200, text: str = ""):
        self.status_code = status_code
        self.text = text


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(molit_client.time, "sleep", lambda s: None)


def test_parse_trade_sample():
    items = parse_trade_xml(read("trade_sample.xml"), "11680")
    assert len(items) == 3
    assert items[0].apt_seq == "11680-280" and items[0].amount == 202500 and items[0].deal_date == "2026-10-06"
    assert items[0].lawd_cd == "11680" and items[0].dong == "개포동" and items[0].jibun == "12"
    assert items[0].build_year == 1992 and items[0].area == 49.86 and items[0].floor == 9
    cancelled = [i for i in items if i.cancel_date]
    assert len(cancelled) == 1 and cancelled[0].cancel_date == "2026-10-20"
    assert items[0].cancel_date is None


def test_parse_rent_sample_handles_commas_blanks_and_missing_seq():
    items = parse_rent_xml(read("rent_sample.xml"), "11680")
    assert items[0].deposit == 49000 and items[0].monthly_rent == 0 and items[0].contract_type is None
    assert items[0].use_rr_right is None and items[0].pre_deposit is None and items[0].pre_monthly_rent is None
    assert items[1].contract_type == "갱신" and items[1].use_rr_right is True and items[1].pre_deposit == 9000
    assert items[1].pre_monthly_rent == 150 and items[1].contract_term == "24.11~26.11"
    assert items[2].apt_seq is None and items[2].build_year is None and items[2].floor == 0


def test_lawd_cd_is_callers_code():
    items = parse_trade_xml(read("trade_sample.xml"), "99999")
    assert {i.lawd_cd for i in items} == {"99999"}


def test_fetch_trades_paginates(monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(params["pageNo"])
        xml = read("trade_sample.xml").replace("<totalCount>3</totalCount>", "<totalCount>1500</totalCount>")
        return FakeResponse(200, xml)

    monkeypatch.setattr(requests, "get", fake_get)
    items = fetch_trades("11680", "202610")
    assert calls == [1, 2]
    assert len(items) == 6


def test_fetch_rents_single_page(monkeypatch):
    seen = []

    def fake_get(url, params=None, timeout=None):
        seen.append((url, params))
        return FakeResponse(200, read("rent_sample.xml"))

    monkeypatch.setattr(requests, "get", fake_get)
    items = fetch_rents("11680", "202610")
    assert len(items) == 3 and len(seen) == 1
    assert seen[0][0] == molit_client.RENT_URL
    assert seen[0][1]["LAWD_CD"] == "11680" and seen[0][1]["DEAL_YMD"] == "202610"
    assert seen[0][1]["numOfRows"] == 1000


def test_fetch_raises_molit_error_after_retries(monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(1)
        return FakeResponse(429, "")

    monkeypatch.setattr(requests, "get", fake_get)
    with pytest.raises(MolitError) as ei:
        fetch_trades("11680", "202610")
    assert len(calls) == 5
    assert ei.value.lawd_cd == "11680" and ei.value.deal_ymd == "202610"


def test_retries_on_timeout_then_succeeds(monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(1)
        if len(calls) < 3:
            raise requests.exceptions.Timeout()
        return FakeResponse(200, read("trade_sample.xml"))

    monkeypatch.setattr(requests, "get", fake_get)
    assert len(fetch_trades("11680", "202610")) == 3
    assert len(calls) == 3


def test_non_000_result_code_raises_without_retry(monkeypatch):
    calls = []
    xml = ("<response><header><resultCode>22</resultCode>"
           "<resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR.</resultMsg></header></response>")

    def fake_get(url, params=None, timeout=None):
        calls.append(1)
        return FakeResponse(200, xml)

    monkeypatch.setattr(requests, "get", fake_get)
    with pytest.raises(MolitError):
        fetch_rents("11680", "202610")
    assert len(calls) == 1


def test_injected_session_is_used():
    class FakeSession:
        def get(self, url, params=None, timeout=None):
            return FakeResponse(200, read("trade_sample.xml"))

    assert len(fetch_trades("11680", "202610", session=FakeSession())) == 3


def _with_bad_items(name: str) -> str:
    """샘플 첫 item 을 복제해 형식이 깨진 item 3개를 덧붙인다."""
    xml = read(name)
    first = xml[xml.index("<item>"): xml.index("</item>") + len("</item>")]
    bad = [
        first.replace(first[first.index("<excluUseAr>"): first.index("</excluUseAr>")], "<excluUseAr> "),
        first.replace(first[first.index("<dealDay>"): first.index("</dealDay>")], "<dealDay>"),
    ]
    if "<cdealDay>" in first:
        bad.append(first.replace(first[first.index("<cdealDay>"): first.index("</cdealDay>")],
                                 "<cdealDay>26/10/20"))
    else:
        bad.append(first.replace("<dealMonth>", "<dealMonth>x"))
    return xml.replace("</items>", "".join(bad) + "</items>")


def test_parse_trade_skips_malformed_items_and_counts_them():
    items = parse_trade_xml(_with_bad_items("trade_sample.xml"), "11680")
    assert len(items) == 3  # 원래 3건만 남는다
    assert items.skipped == 3
    assert parse_trade_xml(read("trade_sample.xml"), "11680").skipped == 0


def test_parse_rent_skips_malformed_items_and_counts_them():
    good = parse_rent_xml(read("rent_sample.xml"), "11680")
    items = parse_rent_xml(_with_bad_items("rent_sample.xml"), "11680")
    assert len(items) == len(good) and items.skipped == 3


def test_fetch_all_sums_skipped_across_pages(monkeypatch):
    page = _with_bad_items("trade_sample.xml").replace(
        "<totalCount>3</totalCount>", "<totalCount>1500</totalCount>")
    monkeypatch.setattr(requests, "get", lambda url, params=None, timeout=None: FakeResponse(200, page))
    items = fetch_trades("11680", "202610")
    assert len(items) == 6 and items.skipped == 6
