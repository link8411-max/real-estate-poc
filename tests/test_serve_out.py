import gzip
import json

from scripts.serve_out import resolve


def _write(tmp_path, rel, obj):
    p = tmp_path / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(gzip.compress(json.dumps(obj).encode()))


def test_serves_gz_with_headers(tmp_path):
    _write(tmp_path, "v1/meta.json.gz", {"a": 1})
    status, headers, body = resolve(str(tmp_path), "/v1/meta.json")
    assert status == 200
    assert headers["Content-Type"] == "application/json"
    assert headers["Content-Encoding"] == "gzip"
    assert headers["Access-Control-Allow-Origin"] == "*"
    assert headers["Cache-Control"] == "no-store"
    assert json.loads(gzip.decompress(body)) == {"a": 1}


def test_query_string_ignored(tmp_path):
    _write(tmp_path, "v1/meta.json.gz", {})
    assert resolve(str(tmp_path), "/v1/meta.json?x=1")[0] == 200


def test_404_and_traversal(tmp_path):
    _write(tmp_path, "v1/meta.json.gz", {})
    assert resolve(str(tmp_path), "/v1/nope.json")[0] == 404
    assert resolve(str(tmp_path), "/other.json")[0] == 404
    assert resolve(str(tmp_path), "/v1/../v1/meta.json")[0] == 404
    assert resolve(str(tmp_path), "/v1/meta.json.gz")[0] == 404
