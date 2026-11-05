from __future__ import annotations

from pipeline import indexnow as ix

SITE = "https://zipsise.com"


def test_build_urls_hubs_and_dedupe():
    urls = ix.build_urls(SITE, [5, 7, 5])
    assert urls[:2] == [f"{SITE}/apartment/5", f"{SITE}/apartment/7"]
    assert urls[2:] == [f"{SITE}/", f"{SITE}/highs", f"{SITE}/canceled", f"{SITE}/stats"]
    assert len(urls) == 6


def test_build_urls_empty():
    assert ix.build_urls(SITE, []) == []


def test_parse_sitemap_with_namespace():
    xml = ('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
           '<url><loc>https://zipsise.com/</loc></url>'
           '<url><loc>https://zipsise.com/apartment/1</loc><lastmod>2026-11-01</lastmod></url>'
           '</urlset>')
    assert ix.parse_sitemap(xml) == ["https://zipsise.com/", "https://zipsise.com/apartment/1"]


def test_chunks():
    parts = ix.chunks([str(i) for i in range(10_001)], 10_000)
    assert [len(p) for p in parts] == [10_000, 1]


def test_payload():
    p = ix.payload("https://zipsise.com/", "abc", ["u"])
    assert p == {"host": "zipsise.com", "key": "abc", "keyLocation": "https://zipsise.com/abc.txt", "urlList": ["u"]}


def test_notify_calls_per_endpoint_and_chunk():
    calls = []

    def post(endpoint, body):
        calls.append((endpoint, len(body["urlList"])))
        return 200

    urls = [f"{SITE}/apartment/{i}" for i in range(10_001)]
    pauses = []
    res = ix.notify(SITE, "k", urls, ["https://a/x", "https://searchadvisor.naver.com/indexnow"],
                    post=post, sleep=pauses.append)
    assert len(calls) == 4
    assert len(pauses) == 3
    assert res[-1] == ("naver", "200", 1)


def test_notify_survives_403_and_exceptions():
    def post(endpoint, body):
        if "bad" in endpoint:
            raise ConnectionError("x")
        return 403

    res = ix.notify(SITE, "k", ["u"], ["https://ok/x", "https://bad/x"], post=post, sleep=lambda s: None)
    assert [r[1] for r in res] == ["403", "error ConnectionError"]


def test_main_changed_empty_sends_nothing(tmp_path, capsys):
    f = tmp_path / "c.json"
    f.write_text("[]")
    assert ix.main(["--changed", str(f)]) == 0
    assert "보낼 URL 없음" in capsys.readouterr().out
