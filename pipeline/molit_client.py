from __future__ import annotations

import logging
import math
import os
import random
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

TRADE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
RENT_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"

PAGE_SIZE = 1000
TIMEOUT = 30
MAX_RETRIES = 5


class MolitError(Exception):
    def __init__(self, lawd_cd: str, deal_ymd: str, reason: str):
        super().__init__(f"MOLIT {lawd_cd}/{deal_ymd}: {reason}")
        self.lawd_cd = lawd_cd
        self.deal_ymd = deal_ymd
        self.reason = reason


@dataclass
class TradeItem:
    apt_name: str
    apt_seq: str | None
    lawd_cd: str
    dong: str
    jibun: str
    build_year: int | None
    deal_date: str  # YYYY-MM-DD
    amount: int  # 만원
    area: float
    floor: int
    cancel_date: str | None


@dataclass
class RentItem:
    apt_name: str
    apt_seq: str | None
    lawd_cd: str
    dong: str
    jibun: str
    build_year: int | None
    deal_date: str  # YYYY-MM-DD
    deposit: int
    monthly_rent: int
    area: float
    floor: int
    contract_type: str | None  # "신규" | "갱신" | None
    contract_term: str | None
    use_rr_right: bool | None
    pre_deposit: int | None
    pre_monthly_rent: int | None


class ParseResult(list):
    """파싱된 item 목록 + 형식 오류로 건너뛴 item 수(`skipped`)."""

    def __init__(self, items=(), skipped: int = 0):
        super().__init__(items)
        self.skipped = skipped


_ITEM_ERRORS = (ValueError, KeyError, IndexError, TypeError)


def _text(item: ET.Element, tag: str) -> str:
    return (item.findtext(tag) or "").strip()


def _opt_str(item: ET.Element, tag: str) -> str | None:
    return _text(item, tag) or None


def _opt_int(item: ET.Element, tag: str) -> int | None:
    v = _text(item, tag).replace(",", "")
    return int(v) if v else None


def _deal_date(item: ET.Element) -> str:
    return f"{int(_text(item, 'dealYear')):04d}-{int(_text(item, 'dealMonth')):02d}-{int(_text(item, 'dealDay')):02d}"


def _cancel_date(item: ET.Element) -> str | None:
    v = _text(item, "cdealDay")
    if not v:
        return None
    yy, mm, dd = v.split(".")
    return f"20{yy}-{mm}-{dd}"


def _items(xml: str) -> list[ET.Element]:
    return ET.fromstring(xml).findall("./body/items/item")


def _parse_items(xml: str, convert) -> ParseResult:
    out = ParseResult()
    for i in _items(xml):
        try:
            out.append(convert(i))
        except _ITEM_ERRORS as e:  # 한 행이 깨져도 나머지는 살린다
            out.skipped += 1
            logger.warning("malformed MOLIT item skipped (%s: %s): aptNm=%s",
                           type(e).__name__, e, _text(i, "aptNm"))
    return out


def parse_trade_xml(xml: str, lawd_cd: str) -> ParseResult:
    return _parse_items(xml, lambda i: TradeItem(
        apt_name=_text(i, "aptNm"),
        apt_seq=_opt_str(i, "aptSeq"),
        lawd_cd=lawd_cd,
        dong=_text(i, "umdNm"),
        jibun=_text(i, "jibun"),
        build_year=_opt_int(i, "buildYear"),
        deal_date=_deal_date(i),
        amount=_opt_int(i, "dealAmount") or 0,
        area=float(_text(i, "excluUseAr")),
        floor=_opt_int(i, "floor") or 0,
        cancel_date=_cancel_date(i),
    ))


def parse_rent_xml(xml: str, lawd_cd: str) -> ParseResult:
    return _parse_items(xml, lambda i: RentItem(
        apt_name=_text(i, "aptNm"),
        apt_seq=_opt_str(i, "aptSeq"),
        lawd_cd=lawd_cd,
        dong=_text(i, "umdNm"),
        jibun=_text(i, "jibun"),
        build_year=_opt_int(i, "buildYear"),
        deal_date=_deal_date(i),
        deposit=_opt_int(i, "deposit") or 0,
        monthly_rent=_opt_int(i, "monthlyRent") or 0,
        area=float(_text(i, "excluUseAr")),
        floor=_opt_int(i, "floor") or 0,
        contract_type=_opt_str(i, "contractType"),
        contract_term=_opt_str(i, "contractTerm"),
        use_rr_right=True if _text(i, "useRRRight") == "사용" else None,
        pre_deposit=_opt_int(i, "preDeposit"),
        pre_monthly_rent=_opt_int(i, "preMonthlyRent"),
    ))


def _backoff(attempt: int, base: int = 2, max_wait: int = 30) -> float:
    return min(base**attempt + random.uniform(0, 1), max_wait)


def _get_page(url: str, lawd_cd: str, deal_ymd: str, page: int, session) -> tuple[str, int]:
    """한 페이지를 받아 (xml, totalCount)를 돌려준다. 실패는 MolitError."""
    params = {
        "serviceKey": os.environ.get("MOLIT_API_KEY", ""),
        "LAWD_CD": lawd_cd,
        "DEAL_YMD": deal_ymd,
        "numOfRows": PAGE_SIZE,
        "pageNo": page,
    }
    getter = session if session is not None else requests
    last = "unknown"
    for attempt in range(MAX_RETRIES):
        try:
            resp = getter.get(url, params=params, timeout=TIMEOUT)
        except requests.exceptions.Timeout:
            last = "timeout"
        except requests.exceptions.ConnectionError:
            last = "connection error"
        except requests.exceptions.RequestException as e:
            raise MolitError(lawd_cd, deal_ymd, str(e)) from e
        else:
            if resp.status_code in (429, 502):
                last = f"HTTP {resp.status_code}"
            elif resp.status_code != 200:
                raise MolitError(lawd_cd, deal_ymd, f"HTTP {resp.status_code}")
            else:
                return _check_envelope(resp.text, lawd_cd, deal_ymd)
        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff(attempt))
    raise MolitError(lawd_cd, deal_ymd, f"max retries ({MAX_RETRIES}) exceeded: {last}")


def _check_envelope(xml: str, lawd_cd: str, deal_ymd: str) -> tuple[str, int]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        raise MolitError(lawd_cd, deal_ymd, f"invalid XML: {e}") from e
    code = (root.findtext("./header/resultCode") or "").strip()
    if code != "000":
        msg = (root.findtext("./header/resultMsg") or "").strip()
        raise MolitError(lawd_cd, deal_ymd, f"resultCode {code}: {msg}")
    total = int((root.findtext("./body/totalCount") or "0").strip() or 0)
    return xml, total


def _fetch_all(url: str, parse, lawd_cd: str, deal_ymd: str, session) -> ParseResult:
    xml, total = _get_page(url, lawd_cd, deal_ymd, 1, session)
    out = parse(xml, lawd_cd)
    for page in range(2, math.ceil(total / PAGE_SIZE) + 1):
        xml, _ = _get_page(url, lawd_cd, deal_ymd, page, session)
        more = parse(xml, lawd_cd)
        out.extend(more)
        out.skipped += more.skipped
    return out


def fetch_trades(lawd_cd: str, deal_ymd: str, *, session=None) -> ParseResult:
    return _fetch_all(TRADE_URL, parse_trade_xml, lawd_cd, deal_ymd, session)


def fetch_rents(lawd_cd: str, deal_ymd: str, *, session=None) -> ParseResult:
    return _fetch_all(RENT_URL, parse_rent_xml, lawd_cd, deal_ymd, session)
