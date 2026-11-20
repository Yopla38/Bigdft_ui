#!/usr/bin/env python3
"""Serve a workshop locally.

``index.html`` is written as page content (no doctype, no <html>), which is the
form the publishing pipeline expects. This server wraps it in the same minimal
document skeleton so that it renders in standards mode.

Usage:  python tools/preview.py [port] [directory]
        python tools/preview.py                  the first workshop, http://localhost:8765
        python tools/preview.py 8766 workshop    workshop 2, on its recorded results

``backend/serve.py`` serves workshop 2 the same way and computes for real.
"""
from __future__ import annotations

import http.server
import sys
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parent.parent
HEAD = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)


def page(root: Path) -> bytes:
    """index.html of *root* as a whole document."""
    return (HEAD + (root / "index.html").read_text() + "</body></html>").encode()


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static files of ``root``, and its index.html wrapped. A subclass sets ``root``."""

    root = REPOSITORY / "prototype"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(self.root), **kwargs)

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            self.send_bytes(200, page(self.root), "text/html; charset=utf-8")
        else:
            super().do_GET()

    def send_bytes(self, code: int, body: bytes, kind: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # The page is its scripts, loaded one by one, and they change while it is worked on: a browser that kept
        # some of them would run a page made of two versions. Nothing is kept.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    Handler.root = REPOSITORY / (sys.argv[2] if len(sys.argv) > 2 else "prototype")
    print(f"http://localhost:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
