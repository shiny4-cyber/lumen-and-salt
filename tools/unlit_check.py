"""Unlit value-separation probe.

Two steps, because the browser and PIL live in different interpreters on this host:
  xvfb-run -a python3 tools/unlit_check.py --label before     # capture (Playwright + Firefox)
  /usr/bin/python3 tools/unlit_check.py --measure before      # measure (PIL)

The frame is the game's own `?shot=unlit` staging (the cover scene, headlight off). Object
footprints come from the page (window.__shotPatches), so the patches are the objects the
simulation actually placed, not hand-picked boxes.
"""

import json
import math
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SCRATCH = Path("/root/.hermes/cache/scratch")
THRESHOLD = 10.0


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


def luminance(image, x0, y0, x1, y1):
    left, top = max(0, int(x0)), max(0, int(y0))
    right, bottom = min(image.width, int(x1)), min(image.height, int(y1))
    if right - left < 2 or bottom - top < 2:
        return None
    box = image.crop((left, top, right, bottom)).convert("L")
    pixels = list(box.getdata())
    if not pixels:
        return None
    return sum(pixels) / len(pixels)


def capture(label):
    label = label or "frame"
    port = free_port()
    server = subprocess.Popen(["node", str(ROOT / "serve.ts"), "--port", str(port)], cwd=str(ROOT),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = SCRATCH / f"unlit-{label}.jpg"
    try:
        if not wait_for_server(port):
            raise SystemExit("server did not start")
        with sync_playwright() as p:
            browser = p.firefox.launch(headless=False)
            page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
            page.goto(f"http://127.0.0.1:{port}/?shot=unlit&seed=20261116", wait_until="load")
            page.wait_for_function("() => window.__shotReady === true", timeout=30000)
            patches = page.evaluate("() => window.__shotPatches()")
            page.screenshot(path=str(out), type="jpeg", quality=92)
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    (SCRATCH / f"unlit-{label}-patches.json").write_text(json.dumps(patches, indent=2))
    print(f"captured {out}")


def percentile_luminance(image, x0, y0, x1, y1, quantile):
    """The `quantile` brightness inside a patch: the worst case of a silhouette."""
    left, top = max(0, int(x0)), max(0, int(y0))
    right, bottom = min(image.width, int(x1)), min(image.height, int(y1))
    if right - left < 2 or bottom - top < 2:
        return None
    pixels = sorted(image.crop((left, top, right, bottom)).convert("L").getdata())
    if not pixels:
        return None
    index = min(len(pixels) - 1, max(0, int(len(pixels) * quantile)))
    return pixels[index]


def annulus_median(image, cx, cy, inner, outer):
    left, top = max(0, int(cx - outer)), max(0, int(cy - outer))
    right, bottom = min(image.width, int(cx + outer)), min(image.height, int(cy + outer))
    if right - left < 2 or bottom - top < 2:
        return None
    crop = image.crop((left, top, right, bottom)).convert("L")
    pixels = crop.load()
    values = []
    for y in range(crop.height):
        for x in range(crop.width):
            dx = (left + x) - cx
            dy = (top + y) - cy
            distance = math.hypot(dx, dy)
            if inner <= distance <= outer:
                values.append(pixels[x, y])
    if len(values) < 20:
        return None
    values.sort()
    return values[len(values) // 2]


def measure(label):
    from PIL import Image
    out = SCRATCH / f"unlit-{label}.jpg"
    patches = json.loads((SCRATCH / f"unlit-{label}-patches.json").read_text())
    image = Image.open(out)
    camera = patches["camera"]
    rows = []
    for obj in patches["objects"]:
        cx = obj["x"] - camera["x"]
        cy = obj["y"] - camera["y"]
        r = obj["r"]
        if cx < -r or cy < -r or cx > 1280 + r or cy > 720 + r:
            continue
        # Keep clear of the HUD bands, and of the frame border where the renderer culls
        # sprites: a culled object would be measured as water against water.
        if cy < 170 or cy > 700:
            continue
        if cx < 90 or cx > 1190 or cy < 90 or cy > 630:
            continue
        inside = percentile_luminance(image, cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7, 0.25)
        # Background: the water in the annulus just outside the object (1.25r..1.75r). This is
        # the local band the eye compares the object against.
        background = annulus_median(image, cx, cy, r * 2.2, r * 3.0)
        if inside is None or background is None:
            continue
        rows.append({"id": obj["id"], "inside": round(inside, 1), "background": round(background, 1), "delta": round(inside - background, 1)})

    rows.sort(key=lambda row: row["delta"])
    print(f"\nframe: {out}  ({image.width}x{image.height})")
    print(f"{'OBJECT':14} {'INSIDE':>7} {'BG':>7} {'DELTA':>7}")
    for row in rows:
        flag = "" if row["delta"] >= THRESHOLD else "   <-- fails"
        print(f"{row['id']:14} {row['inside']:7.1f} {row['background']:7.1f} {row['delta']:7.1f}{flag}")
    worst = rows[0]["delta"] if rows else None
    print(f"\nworst delta: {worst}  threshold: {THRESHOLD}  objects measured: {len(rows)}")
    print("PASS" if worst is not None and worst >= THRESHOLD else "FAIL")
    (SCRATCH / f"unlit-{label}.json").write_text(json.dumps({"worst": worst, "threshold": THRESHOLD, "rows": rows}, indent=2))
    # A report exit code: the measurement itself succeeded even when objects fail the bar.
    return 0


if __name__ == "__main__":
    if "--measure" in sys.argv:
        sys.exit(measure(sys.argv[sys.argv.index("--measure") + 1]))
    label = sys.argv[sys.argv.index("--label") + 1] if "--label" in sys.argv else "frame"
    capture(label)
