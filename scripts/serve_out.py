"""로컬 개발용 정적 서버: /v1/...json -> {dir}/v1/...json.gz (gzip 그대로 전달)."""
from __future__ import annotations

import argparse
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

HEADERS = {
    "Content-Type": "application/json",
    "Content-Encoding": "gzip",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
}


def resolve(root: str, raw_path: str) -> tuple[int, dict[str, str], bytes]:
    path = unquote(urlsplit(raw_path).path)
    if ".." in path or not path.startswith("/v1/") or not path.endswith(".json"):
        return 404, {"Access-Control-Allow-Origin": "*"}, b""
    file = os.path.join(root, path.lstrip("/") + ".gz")
    try:
        with open(file, "rb") as f:
            body = f.read()
    except OSError:
        return 404, {"Access-Control-Allow-Origin": "*"}, b""
    return 200, {**HEADERS, "Content-Length": str(len(body))}, body


def make_handler(root: str) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            status, headers, body = resolve(root, self.path)
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            if status != 200:
                self.send_header("Content-Length", "0")
            self.end_headers()
            self.wfile.write(body)

    return Handler


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python scripts/serve_out.py")
    p.add_argument("--dir", default="out")
    p.add_argument("--port", type=int, default=8787)
    a = p.parse_args(argv)
    server = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(a.dir))
    print(f"serving {a.dir} on http://localhost:{a.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
