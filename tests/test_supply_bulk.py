from __future__ import annotations

import sqlite3
import zipfile

import pytest

from pipeline import supply_bulk
from pipeline.db import migrate, upsert_apartment
from pipeline.supply_bulk import BulkError, download, find_latest_file_id, ingest


def line(sigungu, bjdong, bun, ji, ho, gb, area, *, plat="0", dong="101동",
         purps="아파트", pk=None, nfields=39):
    f = [""] * 39
    f[0] = pk or f"pk{sigungu}{bun}{ji}{dong}{ho}"
    f[8], f[9], f[10], f[11], f[12] = sigungu, bjdong, plat, bun, ji
    f[21], f[22] = dong, f"{ho}호"
    f[26] = gb
    f[35], f[36] = purps, "아파트" if gb == "1" else "계단실"
    f[37] = str(area)
    s = "|".join(f)
    return s if nfields == 39 else s + "|x" * (nfields - 39) if nfields > 39 else "|".join(f[:nfields])


def make_zip(path, lines):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mart_djy_06.txt", "\n".join(lines) + "\n")
    return str(path)


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    migrate(c)
    return c


def add_apt(conn, name, lawd="11710", umd="10100", jibun="19", dong="잠실동"):
    return upsert_apartment(conn, name=name, lawd_cd=lawd, dong=dong, jibun=jibun,
                            build_year=2000, apt_seq=None,
                            umd_cd=umd, bonbun=jibun.zfill(4), bubun="0000")


def unit(sg, bj, bun, ji, ho, excl, common, dong="101동"):
    return [line(sg, bj, bun, ji, ho, "1", excl, dong=dong),
            line(sg, bj, bun, ji, ho, "2", common, dong=dong)]


def types(conn, apt):
    return conn.execute("SELECT excl_area, supply_area, sample_n FROM register_types WHERE apt_id=?"
                        " ORDER BY excl_area", (apt,)).fetchall()


def status(conn, apt):
    r = conn.execute("SELECT status FROM register_fetch WHERE apt_id=?", (apt,)).fetchone()
    return r and r[0]


def test_ingest_two_complexes_ignores_other_sigungu(conn, tmp_path):
    a = add_apt(conn, "엘스", jibun="19")
    b = add_apt(conn, "렉슬", jibun="20")
    lines = (unit("11710", "10100", "0019", "0000", 101, 84.8, 26.72)
             + unit("11710", "10100", "0020", "0000", 101, 59.98, 26.94)
             + unit("99999", "10100", "0019", "0000", 101, 10.0, 1.0)
             + [line("11710", "10100", "0019", "0000", 201, "1", 5, plat="1")])
    out = ingest(conn, make_zip(tmp_path / "a.zip", lines))
    assert types(conn, a) == [(84.8, 111.52, 1)]
    assert types(conn, b) == [(59.98, 86.92, 1)]
    assert out["matched_keys"] == 2 and out["apartments_done"] == 2
    assert out["apartments_empty"] == 0 and out["lines"] == len(lines)
    assert status(conn, a) == "done"


def test_scattered_rows_are_summed(conn, tmp_path):
    a = add_apt(conn, "엘스")
    r1 = line("11710", "10100", "0019", "0000", 101, "1", 84.8, pk="p1")
    c1 = line("11710", "10100", "0019", "0000", 101, "2", 20.0, pk="p1")
    c2 = line("11710", "10100", "0019", "0000", 101, "2", 6.72, pk="p1")
    other = unit("11710", "10100", "0019", "0000", 102, 84.8, 26.72)
    ingest(conn, make_zip(tmp_path / "a.zip", [r1] + other + [c1] + other[:0] + [c2]))
    assert types(conn, a) == [(84.8, 111.52, 2)]


def test_bad_lines_skipped_and_counted(conn, tmp_path):
    a = add_apt(conn, "엘스")
    good = unit("11710", "10100", "0019", "0000", 101, 84.8, 26.72)
    bad_count = line("11710", "10100", "0019", "0000", 102, "1", 84.8, nfields=38)
    bad_area = line("11710", "10100", "0019", "0000", 103, "1", "abc")
    junk = "a|b"
    out = ingest(conn, make_zip(tmp_path / "a.zip", [bad_count, bad_area, junk] + good))
    assert out["skipped_lines"] == 3
    assert types(conn, a) == [(84.8, 111.52, 1)]


def test_empty_keeps_existing_types(conn, tmp_path):
    a = add_apt(conn, "엘스")
    conn.execute("INSERT INTO register_types VALUES (?,?,?,?,?)", (a, 84.8, 111.0, 3, 1.0))
    only_office = [line("11710", "10100", "0019", "0000", 101, "1", 17.8, purps="오피스텔")]
    only_office[0] = only_office[0].replace("아파트", "오피스텔")
    out = ingest(conn, make_zip(tmp_path / "a.zip", only_office))
    assert out["apartments_empty"] == 1 and status(conn, a) == "empty"
    assert types(conn, a) == [(84.8, 111.0, 3)]


def test_same_key_two_complexes_and_alias_excluded(conn, tmp_path):
    a = add_apt(conn, "엘스")
    b = conn.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun, umd_cd, bonbun, bubun)"
                     " VALUES ('엘스2','11710','잠실동','19','10100','0019','0000')").lastrowid
    old = conn.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun, umd_cd, bonbun, bubun)"
                       " VALUES ('엘스구','11710','잠실동','19','10100','0019','0000')").lastrowid
    conn.execute("INSERT INTO apartment_aliases(old_id, canonical_id) VALUES (?,?)", (old, a))
    out = ingest(conn, make_zip(tmp_path / "a.zip",
                                unit("11710", "10100", "0019", "0000", 101, 84.8, 26.72)))
    assert types(conn, a) == types(conn, b) == [(84.8, 111.52, 1)]
    assert types(conn, old) == [] and status(conn, old) is None
    assert out["apartments_done"] == 2 and out["matched_keys"] == 1


def test_apartment_without_key_untouched(conn, tmp_path):
    x = upsert_apartment(conn, name="산", lawd_cd="11710", dong="잠실동", jibun="산1",
                         build_year=2000, apt_seq=None)
    ingest(conn, make_zip(tmp_path / "a.zip", unit("11710", "10100", "0019", "0000", 1, 84.8, 20)))
    assert status(conn, x) is None


def row_html(gubun, name, ym, fid):
    return (f'<tr><td>1</td><td>{gubun}</td><td>{name} ({ym})</td>'
            f'<td><button onclick="fnDownloadPop(\'03\',\'0306\',\'{fid}\')">다운로드</button></td></tr>')


LIST_HTML = ("<table>" + row_html("폐쇄말소대장", "전유공용면적", "2026년 10월", "CLOSED")
             + row_html("건축물대장", "전유공용면적", "2026년 09월", "OPN09")
             + row_html("건축물대장", "전유공용면적", "2026년 08월", "OPN08") + "</table>")


class Resp:
    def __init__(self, text="", chunks=()):
        self.text, self._chunks = text, chunks

    def raise_for_status(self):
        pass

    def iter_content(self, n):
        return iter(self._chunks)


class FakeSession:
    def __init__(self, chunks=()):
        self.calls, self.chunks = [], chunks

    def get(self, url, **kw):
        self.calls.append(("GET", url, kw))
        return Resp(LIST_HTML if "list" in url else "")

    def post(self, url, **kw):
        self.calls.append(("POST", url, kw))
        return Resp(chunks=self.chunks)


def test_find_latest_picks_geonchuk_latest(monkeypatch):
    s = FakeSession()
    assert find_latest_file_id(s) == ("OPN09", "2026-09")
    assert [c[2]["params"]["pageIndex"] for c in s.calls] == [1, 2, 3, 4]


def test_find_latest_not_found():
    s = FakeSession()
    s.get = lambda url, **kw: Resp("<table></table>")
    with pytest.raises(BulkError):
        find_latest_file_id(s)


def test_download_three_steps(tmp_path):
    src = make_zip(tmp_path / "src.zip", ["x"])
    data = open(src, "rb").read()
    s = FakeSession(chunks=[data[:10], data[10:]])
    dest = tmp_path / "d.zip"
    assert download(s, "OPN09", str(dest)) == len(data)
    kinds = [(c[0], c[1].rsplit("/", 1)[1]) for c in s.calls]
    assert kinds == [("GET", "idx-lgcpt-pvsn-srvc-list.do"), ("POST", "idx-srvc-hstry-insert.do"),
                     ("POST", "fileOpnDown.do")]
    assert s.calls[1][2]["data"] == {"opnLgcptTaskSeCd": "03", "opnTaskCd": "0306", "opnPrcusePrpsCd": "1"}
    assert s.calls[2][2]["data"] == {"srvrFileNm": "OPN09"}


def test_download_empty_or_not_zip_raises(tmp_path):
    with pytest.raises(BulkError):
        download(FakeSession(chunks=[]), "X", str(tmp_path / "e.zip"))
    with pytest.raises(BulkError):
        download(FakeSession(chunks=[b"not a zip"]), "X", str(tmp_path / "n.zip"))
