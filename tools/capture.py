"""Capture the entry screenshots from the real game, in a real browser.

Firefox is launched headed under Xvfb: headless Firefox on this host does not composite the
canvas into screenshots. Each scene is the game's own `?shot=` staging, drawn by the game's
own renderer; the shutter waits for window.__shotReady, which the page sets only after two
explicit draw calls, so the frame in the file is a frame the game painted.

Run:  xvfb-run -a python3 tools/capture.py
(the interpreter must be the one whose Playwright knows the installed Firefox revision)
"""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SCENES = [
    ("1-cover.jpg", "cover"),
    ("2-title.jpg", "title"),
    ("3-cut.jpg", "cut"),
    ("4-over.jpg", "over"),
]
MAX_BYTES = 262144


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_server(port, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                return True
        except OSError:
            time.sleep(0.15)
    return False


def main():
    SHOTS.mkdir(exist_ok=True)
    port = free_port()
    server = subprocess.Popen(
        ["node", str(ROOT / "serve.ts"), "--port", str(port)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    report = []
    try:
        if not wait_for_server(port):
            raise SystemExit("the static server did not start")
        with sync_playwright() as p:
            browser = p.firefox.launch(headless=False)
            page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
            errors = []
            page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
            page.on("console", lambda msg: errors.append(f"console: {msg.type}: {msg.text}") if msg.type == "error" else None)
            for name, scene in SCENES:
                page.goto(f"http://127.0.0.1:{port}/?shot={scene}&seed=20261116", wait_until="load")
                page.wait_for_function("() => window.__shotReady === true", timeout=30000)
                target = SHOTS / name
                page.screenshot(path=str(target), type="jpeg", quality=82)
                size = target.stat().st_size
                # The cover must be the most detailed frame; re-shoot it if the shutter fired early.
                report.append({"name": name, "scene": scene, "bytes": size, "over_cap": size > MAX_BYTES})
                print(f"{name:14s} {scene:6s} {size:7d} bytes")
            browser.close()
            if errors:
                print("PAGE ERRORS:", errors)
                raise SystemExit(1)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    over = [row for row in report if row["over_cap"]]
    print(json.dumps({"shots": report, "over_cap": over}, indent=2))
    if over:
        raise SystemExit("a screenshot is over the 256 KiB cap")


if __name__ == "__main__":
    main()
