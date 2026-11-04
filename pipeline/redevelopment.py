"""국토교통부 도시정비사업 통합 데이터 -> 정비구역 목록(v1/redevelopment/zones.json).

재건축 구역은 같은 시군구의 단지 이름과 보수적으로 맞춰 단지 좌표를 쓰고(틀린 단지에 붙이느니 안 붙인다),
나머지(재개발 등)는 카카오 키워드 검색 결과를 data/redevelopment/geocode_cache.json 에 한 번만 받아 둔 뒤 쓴다.
일일 export 는 네트워크를 쓰지 않는다(캐시만 읽음). 지오코딩은 `python -m pipeline.redevelopment --db X --geocode`.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable

import requests
from dotenv import load_dotenv

from pipeline.regions import REGION_FULLNAME, REGIONS, RETIRED_FULLNAME, SUCCEEDED_BY, candidate_codes

load_dotenv()
log = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = str(_ROOT / "data" / "redevelopment" / "molit_redevelopment_20260518.csv")
CACHE_PATH = str(_ROOT / "data" / "redevelopment" / "geocode_cache.json")
SOURCE = "국토교통부 전국 도시정비사업 통합 데이터"
AS_OF = "2026-05-18"
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

SIDO_SHORT = {"서울특별시": "서울", "경기도": "경기", "인천광역시": "인천"}
_MIN_CONTAINS_LEN = 3  # 포함 매칭은 정규화 이름이 이 글자 수 이상일 때만 (짧은 이름은 우연히 겹친다)

# 시도 짧은 이름 -> {CSV 시군구 표기: lawd_cd}. 표기는 REGIONS 짧은 이름(+"구"/"시")을 모두 받는다.
def _build_sigungu_index() -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for code, short in REGIONS.items():
        sido = {"11": "서울특별시", "41": "경기도", "28": "인천광역시"}[code[:2]]
        for key in {short, short + "구", short + "시"}:
            out.setdefault((sido, key), code)
    return out


_SIGUNGU_INDEX = _build_sigungu_index()


def _build_retired_index() -> dict[tuple[str, str], str]:
    """(시도, CSV 시군구 표기) -> 폐지 코드 (인천 서구·중구·동구, 부천시, 화성시)."""
    sido_full = {v: k for k, v in SIDO_SHORT.items()}
    out = {}
    for code, full in RETIRED_FULLNAME.items():
        short, name = full.split(" ", 1)
        out[(sido_full[short], name)] = code
    return out


_RETIRED_INDEX = _build_retired_index()


def _successors(sido: str, sigungu: str) -> list[str]:
    """폐지된 시군구면 후속 코드 목록, 아니면 []."""
    old = _RETIRED_INDEX.get((sido, sigungu))
    return list(SUCCEEDED_BY.get(old, [])) if old else []

_ROMAN = {"Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4", "Ⅴ": "5", "Ⅵ": "6", "Ⅶ": "7", "Ⅷ": "8", "Ⅸ": "9", "Ⅹ": "10"}


def _roman(s: str) -> str:
    for k, v in _ROMAN.items():
        s = s.replace(k, v)
    return s


def _read_csv_rows(path: str) -> list[dict[str, str]]:
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp949"):  # 국토부 원본은 cp949 로 내려온다
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"cannot decode {path}")
    return list(csv.DictReader(text.splitlines()))


def _strip_prefix(v: str) -> str:
    return re.sub(r"^\d+\)", "", v.strip()).strip()


def _stage_order(v: str) -> float | int | None:
    m = re.match(r"\s*(\d+)\)", v)
    if not m:
        return None
    n = int(m.group(1))
    return 4.5 if n == 17 else n  # 17)사업시행자지정 은 조합설립인가와 같은 위치


def _type_group(t: str) -> str:
    for g in ("재건축", "재개발", "주거환경개선"):
        if t.startswith(g):
            return g
    return t


def load_zones(csv_path: str) -> list[dict[str, Any]]:
    """수도권 정비구역을 읽는다. lawd_cd 는 regions 에 없는 시군구(폐지·통합)면 None 으로 두고 목록엔 남긴다."""
    zones: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}
    for r in _read_csv_rows(csv_path):
        sido = (r.get("시도") or "").strip()
        if sido not in SIDO_SHORT:
            continue
        sigungu = (r.get("시군구") or "").strip()
        name = (r.get("구역명칭") or "").strip()
        hh = (r.get("공급 예정 세대수") or "").strip()
        typ = _strip_prefix(r.get("사업유형") or "")
        lawd = _SIGUNGU_INDEX.get((sido, sigungu))
        if lawd is None:
            succ = _successors(sido, sigungu)
            lawd = succ[0] if len(succ) == 1 else None  # 후속이 하나일 때만 (예: 인천 동구 -> 제물포구)
        zone = {
            "zone_id": hashlib.sha1(f"{sido}|{sigungu}|{name}".encode()).hexdigest()[:12],
            "sido": sido,
            "sigungu": sigungu,
            "lawd_cd": lawd,
            "name": name,
            "stage": _strip_prefix(r.get("현 사업추진단계") or ""),
            "stage_order": _stage_order(r.get("현 사업추진단계") or ""),
            "type": typ,
            "type_group": _type_group(typ),
            "operator": _strip_prefix(r.get("사업시행자") or "") or None,
            "households": int(hh) if hh.isdigit() else None,  # '해당없음'·공백은 null (0 과 구분)
            "lat": None, "lng": None, "geo": None, "match": None, "apt_ids": [], "apt_names": [],
        }
        zid = zone["zone_id"]
        if zid in seen:
            if seen[zid] == zone:
                continue  # 원본의 완전히 같은 중복 행
            zid = zone["zone_id"] = hashlib.sha1(f"{sido}|{sigungu}|{name}|{typ}|{len(seen)}".encode()).hexdigest()[:12]
        seen[zid] = zone
        zones.append(zone)
    return zones


# ---------------------------------------------------------------- 단지 매칭

def normalize_name(s: str) -> str:
    """공백·괄호 안 내용·"아파트"·"APT"·기호를 지우고 로마숫자를 아라비아 숫자로 통일."""
    s = re.sub(r"\([^)]*\)", "", s or "")
    for k, v in _ROMAN.items():
        s = s.replace(k, v)
    s = re.sub(r"apt", "", s, flags=re.I)
    s = s.replace("아파트", "")
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s)


_GENERIC_PAREN = {"재건축", "재개발"}  # 괄호 안이 사업유형 표기일 뿐인 경우


def _paren_names(name: str) -> list[str]:
    """괄호 안 단지명 후보. '매탄주공4,5단지' -> ['매탄주공4단지','매탄주공5단지'], 'A,B' -> ['A','B']."""
    out: list[str] = []
    for inner in re.findall(r"\(([^)]*)\)", name or ""):
        inner = inner.strip()
        m = re.match(r"^(.*?[^\d,\s])(\d+(?:\s*,\s*\d+)+)(\D*)$", inner)
        if m:
            out += [f"{m.group(1)}{n.strip()}{m.group(3)}" for n in m.group(2).split(",")]
        else:
            out += inner.split(",")
    return [o for o in out if o.strip() not in _GENERIC_PAREN]


def _zone_candidates(name: str) -> list[str]:
    seen: list[str] = []
    for c in [normalize_name(name)] + [normalize_name(p) for p in _paren_names(name)]:
        if c and c not in seen:
            seen.append(c)
    return seen


def _bound_contains(long: str, short: str) -> bool:
    """short 가 long 에 들어있되 숫자가 이어지지 않을 때만 참 (주공1 이 주공10 에 들어가면 안 됨)."""
    start = 0
    while (i := long.find(short, start)) != -1:
        before = long[i - 1] if i > 0 else ""
        after = long[i + len(short)] if i + len(short) < len(long) else ""
        if not (short[0].isdigit() and before.isdigit()) and not (short[-1].isdigit() and after.isdigit()):
            return True
        start = i + 1
    return False


def _contains(apt: str, zone: str) -> bool:
    """단지명(apt)과 구역명(zone) 한쪽이 다른 쪽을 포함. 구역명이 숫자로 끝나는 짧은 쪽이면(예: '성수1' = 1구역 번호) 불인정."""
    if len(apt) < _MIN_CONTAINS_LEN or len(zone) < _MIN_CONTAINS_LEN:
        return False
    if len(zone) < len(apt):
        return not zone[-1].isdigit() and _bound_contains(apt, zone)
    return _bound_contains(zone, apt)


def match_apartments(conn: sqlite3.Connection, zones: list[dict[str, Any]]) -> dict[str, Any]:
    """재건축 구역을 같은 lawd_cd 의 단지와 맞춘다 (zones 를 제자리에서 갱신, 통계 반환).

    구역 이름 후보(본이름 + 괄호 안 이름)마다: 정규화 이름이 같은 단지가 정확히 1개면 exact, 여럿이면 모호,
    없으면 한쪽이 다른 쪽을 포함하는 단지가 정확히 1개일 때만 contains. 모호하면 매칭하지 않는다.
    """
    by_code: dict[str, list[tuple[int, str, float | None, float | None, str]]] = {}

    def apts_of(lawd: str):
        if lawd not in by_code:
            codes = candidate_codes(lawd)  # 폐지 선행 코드로 남은 단지도 포함
            q = ",".join("?" * len(codes))
            by_code[lawd] = [
                (r[0], normalize_name(r[1]), r[2], r[3], r[1])
                for r in conn.execute(
                    f"SELECT id, name, latitude, longitude FROM apartments WHERE lawd_cd IN ({q}) ORDER BY id", codes
                )
            ]
        return by_code[lawd]

    stats = {"candidates": 0, "exact": 0, "contains": 0, "ambiguous": 0, "ambiguous_ids": []}
    for z in zones:
        if z.get("type_group") != "재건축" or not z.get("lawd_cd"):
            continue
        stats["candidates"] += 1
        apts = apts_of(z["lawd_cd"])
        found: dict[int, str] = {}
        ambiguous = False
        for c in _zone_candidates(z["name"]):
            exact = [a for a in apts if a[1] == c]
            if exact:
                if len(exact) == 1:
                    found.setdefault(exact[0][0], "exact")
                else:
                    ambiguous = True
                continue
            part = [a for a in apts if _contains(a[1], c)]
            if len(part) == 1:
                found.setdefault(part[0][0], "contains")
            elif part:
                ambiguous = True
        if not found:
            if ambiguous:
                stats["ambiguous"] += 1
                stats["ambiguous_ids"].append(z["zone_id"])
            continue
        ids = sorted(found)
        z["apt_ids"] = ids
        z["apt_names"] = [next(a[4] for a in apts if a[0] == i) for i in ids]  # apt_ids 와 같은 순서
        z["match"] = "exact" if all(v == "exact" for v in found.values()) else "contains"
        stats[z["match"]] += 1
        pts = [(a[2], a[3]) for a in apts if a[0] in found and a[2] is not None and a[3] is not None]
        if pts:
            z["lat"] = round(sum(p[0] for p in pts) / len(pts), 6)
            z["lng"] = round(sum(p[1] for p in pts) / len(pts), 6)
            z["geo"] = "apt"
    return stats


# ---------------------------------------------------------------- 지오코딩 (캐시)

KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
_DONG_RE = re.compile(r"^([가-힣]+?[0-9]*(?:동|리|가))\s*(?:\d+통|\d+(?:-\d+)?)?\s*(?:일대)?$")
_LOT_RE = re.compile(r"^\d+(?:-\d+)?$")


def _sido_prefix(z: dict[str, Any]) -> str:
    return f"{SIDO_SHORT[z['sido']]} {z['sigungu']}"


_GENERIC_WORDS = ("도시환경", "주거환경", "주환", "재정비", "촉진", "도시정비", "주택정비", "재개발", "재건축", "정비사업", "블럭", "블록")
_REGION_STEMS = {re.sub(r"[구시군]$", "", n) for c, short in REGIONS.items() for n in (short, short + "구", short + "시")}
_REGION_STEMS |= {"마포", "서대문", "종로", "중구", "동구", "서구"}
_COMPLEX_SUFFIX = ("아파트", "주공", "단지", "차", "맨션", "빌라")


def _paren_plausible(p: str) -> bool:
    """괄호 안 토큰이 단지 이름처럼 보이는지 ('(마포)'·'(도시환경)'·'(B블럭)' 같은 지역·일반어는 아님)."""
    t = _nospace(p)
    if not t or t in _GENERIC_PAREN or any(w in t for w in _GENERIC_WORDS):
        return False
    if t in _REGION_STEMS or re.sub(r"[구시군]$", "", t) in _REGION_STEMS:
        return False
    if t.endswith(_COMPLEX_SUFFIX):
        return True
    if t.endswith(("동", "리", "가", "로", "길")):  # '(대조동)' 같은 지명은 단지 이름이 아니다
        return False
    return bool(re.search(r"\d", t)) or len(t) >= 3


def _attempts(z: dict[str, Any]) -> list[tuple[str, str, str]]:
    """(방법, 종류 keyword|address, 검색어) 순서대로. 앞 방법이 같은 시군구 결과를 주면 거기서 멈춘다."""
    pre = _sido_prefix(z)
    name = _roman(z["name"])  # Ⅰ/Ⅱ/Ⅲ -> 1/2/3 (카카오는 숫자 표기로 더 잘 찾는다)
    base = re.sub(r"\([^)]*\)", "", name).strip()
    out: list[tuple[str, str, str]] = [("name", "keyword", f"{pre} {name}")]  # 가장 먼저: 캐시 키가 검색어 그대로
    inner = re.findall(r"\(([^)]*)\)", name)
    for p in [i.strip() for i in inner] + [x.strip() for x in _paren_names(name)]:
        if p and _paren_plausible(p):
            out.append(("paren", "keyword", f"{pre} {p}"))
    if base:
        if base.endswith(("구역", "지구")):
            out.append(("suffix", "keyword", f"{pre} {re.sub(r'(구역|지구)$', '', base)}"))
        else:
            out.append(("suffix", "keyword", f"{pre} {base}구역"))
        if _LOT_RE.match(base):  # 수원식 지번 구역명: '시 이름 + 번호 + 구역'
            city = (REGION_FULLNAME.get(z["lawd_cd"]) or _sido_prefix(z)).split()[:2]
            out.append(("lot", "keyword", f"{' '.join(city)} {base}구역"))
        m = _DONG_RE.match(base)
        if m:
            out.append(("address", "address", f"{pre} {m.group(1)}"))
    seen, uniq = set(), []
    for a in out:
        if (a[1], a[2]) not in seen:
            seen.add((a[1], a[2]))
            uniq.append(a)
    return uniq


def _cache_key(kind: str, query: str) -> str:
    return query if kind == "keyword" else f"addr:{query}"


def _kakao_get(url: str, query: str, *, session=None) -> list[dict[str, Any]]:
    key = os.environ.get("KAKAO_REST_API_KEY")
    if not key:
        raise RuntimeError("KAKAO_REST_API_KEY not set")
    getter = session if session is not None else requests
    resp = None
    for attempt in range(4):
        resp = getter.get(url, params={"query": query, "size": 1},
                          headers={"Authorization": f"KakaoAK {key}"}, timeout=10)
        if resp.status_code == 429 and attempt < 3:
            time.sleep(1)
            continue
        break
    if resp.status_code != 200:
        raise RuntimeError(f"kakao error {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("documents") or []


def kakao_search(kind: str, query: str, *, session=None) -> dict[str, Any] | None:
    """카카오 로컬 검색(keyword|address)의 첫 결과만, 공통 필드로. 없으면 None, 인증·쿼터 오류는 예외."""
    if kind == "address":
        docs = _kakao_get(KAKAO_ADDRESS_URL, query, session=session)
        if not docs:
            return None
        d = docs[0]
        return {"place_name": "", "address_name": d.get("address_name", ""),
                "road_address_name": "", "y": d.get("y", ""), "x": d.get("x", "")}
    docs = _kakao_get(KAKAO_KEYWORD_URL, query, session=session)
    if not docs:
        return None
    d = docs[0]
    return {k: d.get(k, "") for k in ("place_name", "address_name", "road_address_name", "y", "x")}


def _load_cache(path: str) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _nospace(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def _core_name(name: str) -> str:
    """구역명칭의 핵심어: 괄호 제거, 공백 제거, 로마숫자 통일, 끝의 구역/지구/재개발/재건축 제거."""
    base = _roman(re.sub(r"\([^)]*\)", "", name or ""))
    return re.sub(r"(구역|지구|재개발|재건축)+$", "", _nospace(base))


def _expected_prefixes(z: dict[str, Any]) -> list[str]:
    """채택할 주소 접두(공백 제거). 현행 코드 이름 + CSV 표기 그대로 + 폐지 구역의 모든 후속 구."""
    out = [_nospace(_sido_prefix(z))]  # 카카오가 옛 이름을 돌려줄 수도 있다
    if z.get("lawd_cd") and z["lawd_cd"] in REGION_FULLNAME:
        out.append(_nospace(REGION_FULLNAME[z["lawd_cd"]]))
    for c in _successors(z["sido"], z["sigungu"]):
        out.append(_nospace(REGION_FULLNAME[c]))
    return out


def _name_ok(z: dict[str, Any], doc: dict[str, Any]) -> bool:
    """키워드 결과의 장소명이 구역 핵심어(또는 괄호 안 단지명)를 담고 있는지."""
    place = _roman(_nospace(doc.get("place_name", "")))
    place_n = place.replace("아파트", "")
    core = _core_name(z["name"])
    # 핵심어 뒤에 숫자나 동·가·리가 이어지면 다른 것('대림1' 이 '대림1동')
    if len(core) >= 2 and (re.search(re.escape(core) + r"(?![0-9동가리읍면호])", place)
                           or re.search(re.escape(core) + r"(?![0-9동가리읍면호])", place_n)):
        return True
    cands = []
    for p in re.findall(r"\(([^)]*)\)", z["name"]) + _paren_names(z["name"]):
        if not _paren_plausible(p):
            continue
        cands += [_roman(_nospace(p)), normalize_name(p)]
    return any(len(c) >= 2 and (c in place or c in place_n) for c in cands)


def _accept(z: dict[str, Any], doc: dict[str, Any] | None, kind: str = "keyword") -> tuple[float, float] | None:
    """캐시된 첫 결과가 같은 시군구 안이고(+키워드는 장소명이 구역 핵심어를 담을 때) 좌표를 돌려준다."""
    if not doc:
        return None
    exps = _expected_prefixes(z)
    if not any(_nospace(doc.get(k, "")).startswith(e) for k in ("address_name", "road_address_name") for e in exps):
        return None
    if kind == "keyword" and not _name_ok(z, doc):
        return None
    try:
        return float(doc["y"]), float(doc["x"])
    except (KeyError, ValueError, TypeError):
        return None


def _resolve(z, cache, fetch=None):
    """방법 순서대로 시도해 처음 채택된 (방법, lat, lng, doc). fetch 가 있으면 캐시에 없는 검색어를 조회한다."""
    for method, kind, q in _attempts(z):
        ck = _cache_key(kind, q)
        if ck not in cache:
            if fetch is None:
                continue
            cache[ck] = fetch(kind, q)  # 오류는 호출자가 처리 (캐시에 남기지 않음)
        pos = _accept(z, cache[ck], kind)
        if pos:
            return method, pos[0], pos[1], cache[ck]
    return None


def fill_geocode_cache(
    zones: list[dict[str, Any]], cache_path: str, *,
    geocoder: Callable[[str, str], dict[str, Any] | None] = kakao_search, delay: float = 0.05, say=print,
) -> dict[str, int]:
    """좌표 없는 구역을 방법 순서대로 조회해 캐시를 채운다. 성공·결과 없음(null) 모두 저장해 다시 부르지 않는다.

    호출 오류(인증·쿼터·네트워크)는 캐시에 남기지 않고 거기서 멈춘다(다음 실행이 이어서 처리).
    """
    cache = _load_cache(cache_path)
    new = 0

    def save():
        os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)

    def fetch(kind, q):
        nonlocal new
        res = geocoder(kind, q)
        cache[_cache_key(kind, q)] = res  # _resolve 도 넣지만, 주기 저장 전에 반영해 둔다
        new += 1
        if new % 50 == 0:
            save()  # 중간에 죽어도 받은 결과는 남는다
        if delay:
            time.sleep(delay)
        return res

    for z in zones:
        if z.get("lat") is not None:
            continue
        try:
            _resolve(z, cache, fetch)
        except Exception as e:  # noqa: BLE001 - 어떤 호출 오류든 조기 종료
            say(f"geocode stopped early: {type(e).__name__}: {e}")
            break
    if new:
        save()
    return {"new": new, "cached": len(cache)}


# ---------------------------------------------------------------- 빌드

def _dong_stem(dong: str) -> str:
    return re.sub(r"(동|리|읍|면)\d*가?$|\d*가$", "", dong or "")


def _dong_approx(conn: sqlite3.Connection, z: dict[str, Any], cache: dict[tuple, Any]) -> tuple[float, float] | None:
    """구역 핵심어가 그 시군구의 동 이름으로 시작하면 그 동 단지들의 평균 좌표 (대략적 위치)."""
    if not z.get("lawd_cd") and not _successors(z["sido"], z["sigungu"]):
        return None
    codes = [z["lawd_cd"]] if z.get("lawd_cd") else _successors(z["sido"], z["sigungu"])
    key = tuple(codes)
    if key not in cache:
        allc = sorted({c for lc in codes for c in candidate_codes(lc)})
        q = ",".join("?" * len(allc))
        by: dict[str, list[tuple[float, float]]] = {}
        for dong, lat, lng in conn.execute(
            f"SELECT dong, latitude, longitude FROM apartments WHERE lawd_cd IN ({q}) AND latitude IS NOT NULL", allc
        ):
            st = _dong_stem(dong)
            if len(st) >= 2:
                by.setdefault(st, []).append((lat, lng))
        cache[key] = by
    by = cache[key]
    core = _core_name(z["name"])
    hits = [st for st in by if core.startswith(st)]
    if not hits:
        return None
    best = max(hits, key=len)
    pts = by[best]
    return round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6)


def build_zones_json(
    conn: sqlite3.Connection, csv_path: str, today: date, *, cache_path: str = CACHE_PATH
) -> dict[str, Any]:
    zones = load_zones(csv_path)
    match_apartments(conn, zones)
    cache = _load_cache(cache_path)
    if not cache:
        log.warning("redevelopment geocode cache missing or empty: %s", cache_path)
    for z in zones:
        if z["lat"] is None:
            hit = _resolve(z, cache)
            if hit:
                z["lat"], z["lng"], z["geo"] = hit[1], hit[2], f"kakao_{hit[0]}"
    dong_cache: dict[tuple, Any] = {}
    for z in zones:  # 정밀한 방법이 모두 실패한 구역만, 동 단위 대략 위치
        if z["lat"] is None:
            pos = _dong_approx(conn, z, dong_cache)
            if pos:
                z["lat"], z["lng"], z["geo"] = pos[0], pos[1], "dong_approx"
    return {
        "source": SOURCE,
        "as_of": AS_OF,
        "generated_at": today.isoformat(),  # 입력이 같으면 파일이 바이트 단위로 같도록 실행 시각을 쓰지 않는다
        "zones": zones,
    }


def build_zones_json_safe(conn: sqlite3.Connection, today: date) -> dict[str, Any]:
    """일일 export 용: CSV 가 없거나 읽기 실패해도 잡을 죽이지 않고 빈 목록을 낸다."""
    try:
        if not os.path.exists(CSV_PATH):
            raise FileNotFoundError(CSV_PATH)
        return build_zones_json(conn, CSV_PATH, today)
    except Exception as e:  # noqa: BLE001
        log.warning("redevelopment zones skipped: %s: %s", type(e).__name__, e)
        return {"source": SOURCE, "as_of": AS_OF,
                "generated_at": today.isoformat(), "zones": []}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m pipeline.redevelopment")
    p.add_argument("--db", required=True, help="단지 매칭용 DB (읽기 전용으로 연다)")
    p.add_argument("--geocode", action="store_true", help="좌표 없는 구역을 카카오로 조회해 캐시에 채움")
    p.add_argument("--csv", default=CSV_PATH)
    p.add_argument("--cache", default=CACHE_PATH)
    args = p.parse_args(argv)
    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    try:
        zones = load_zones(args.csv)
        stats = match_apartments(conn, zones)
        print({k: v for k, v in stats.items() if k != "ambiguous_ids"})
        if args.geocode:
            print(fill_geocode_cache(zones, args.cache))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
