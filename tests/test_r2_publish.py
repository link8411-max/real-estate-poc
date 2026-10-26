from __future__ import annotations

import gzip
import json

import pytest

from pipeline import r2_publish
from pipeline.r2_publish import PublishError, main, publish


class FakeClient:
    def __init__(self, fail_keys=()):
        self.calls = []
        self.fail_keys = set(fail_keys)

    def put_object(self, **kw):
        if kw["Key"] in self.fail_keys:
            raise RuntimeError("boom")
        self.calls.append(kw)


def _write(out, key, payload):
    p = out / f"{key}.gz"
    p.parent.mkdir(parents=True, exist_ok=True)
    data = gzip.compress(json.dumps(payload).encode())
    p.write_bytes(data)
    return data


def test_publish_headers_key_body(tmp_path):
    data = _write(tmp_path, "v1/apt/1/trade.json", {"a": 1})
    c = FakeClient()
    n = publish(str(tmp_path), ["v1/apt/1/trade.json"], bucket="b", client=c)
    assert n == 1
    assert c.calls == [dict(
        Bucket="b", Key="v1/apt/1/trade.json", Body=data,
        ContentType="application/json", ContentEncoding="gzip",
        CacheControl="public, max-age=600",
    )]


def test_failure_does_not_stop_others(tmp_path):
    keys = [f"v1/k{i}.json" for i in range(5)]
    for k in keys:
        _write(tmp_path, k, {})
    c = FakeClient(fail_keys={"v1/k2.json"})
    with pytest.raises(PublishError) as ei:
        publish(str(tmp_path), keys, bucket="b", client=c)
    assert len(c.calls) == 4
    assert [k for k, _ in ei.value.failures] == ["v1/k2.json"]
    assert "1" in str(ei.value) and "v1/k2.json" in str(ei.value)


def test_missing_local_file_is_failure(tmp_path):
    _write(tmp_path, "v1/a.json", {})
    c = FakeClient()
    with pytest.raises(PublishError) as ei:
        publish(str(tmp_path), ["v1/a.json", "v1/missing.json"], bucket="b", client=c)
    assert len(c.calls) == 1
    assert ei.value.failures[0][0] == "v1/missing.json"


def test_bucket_from_env_and_unset(tmp_path, monkeypatch):
    _write(tmp_path, "v1/a.json", {})
    monkeypatch.delenv("R2_PUBLIC_BUCKET", raising=False)
    with pytest.raises(ValueError, match="R2_PUBLIC_BUCKET"):
        publish(str(tmp_path), ["v1/a.json"], client=FakeClient())
    monkeypatch.setenv("R2_PUBLIC_BUCKET", "envb")
    c = FakeClient()
    publish(str(tmp_path), ["v1/a.json"], client=c)
    assert c.calls[0]["Bucket"] == "envb"


def test_progress_logging(tmp_path, capsys):
    _write(tmp_path, "v1/a.json", {})
    publish(str(tmp_path), ["v1/a.json"], bucket="b", client=FakeClient())
    assert "[R2] done: 1 ok, 0 failed" in capsys.readouterr().out


def _keys_file(tmp_path, keys):
    f = tmp_path / "keys.json"
    f.write_text(json.dumps(keys))
    return str(f)


def test_cli_success(tmp_path, monkeypatch):
    seen = {}

    def fake(out, keys, *, bucket, max_workers):
        seen.update(out=out, keys=keys, bucket=bucket, w=max_workers)
        return len(keys)

    monkeypatch.setattr(r2_publish, "publish", fake)
    rc = main(["--out", str(tmp_path), "--keys", _keys_file(tmp_path, ["a"]),
               "--bucket", "bb", "--workers", "3"])
    assert rc == 0
    assert seen == dict(out=str(tmp_path), keys=["a"], bucket="bb", w=3)


def test_cli_failure_exit_1(tmp_path, monkeypatch, capsys):
    def fake(*a, **k):
        raise PublishError([("a", RuntimeError("x"))])

    monkeypatch.setattr(r2_publish, "publish", fake)
    rc = main(["--out", str(tmp_path), "--keys", _keys_file(tmp_path, ["a"])])
    assert rc == 1
    assert "a" in capsys.readouterr().err


def test_cli_bad_args(tmp_path, monkeypatch):
    assert main(["--out", str(tmp_path), "--keys", str(tmp_path / "nope.json")]) == 2
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    assert main(["--out", str(tmp_path), "--keys", str(bad)]) == 2
    obj = tmp_path / "obj.json"
    obj.write_text('{"a": 1}')
    assert main(["--out", str(tmp_path), "--keys", str(obj)]) == 2

    def fake(*a, **k):
        raise ValueError("R2_PUBLIC_BUCKET unset")

    monkeypatch.setattr(r2_publish, "publish", fake)
    assert main(["--out", str(tmp_path), "--keys", _keys_file(tmp_path, ["a"])]) == 2
