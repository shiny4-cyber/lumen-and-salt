"""Real-browser tests for LUMEN & SALT: Playwright + Firefox, headed under Xvfb, against a
local static server on an ephemeral port.

The game runs its own fixed-step simulation behind window.__lumen (see main.js), so the tests
drive the real rules, not a mock: descend, thrust, grapple, cut, take a hit, surface, pick a
refit, pause, die and restart. Every page error fails the run, and every frame must be painted.

Run:  xvfb-run -a python3 test/browser_test.py
"""

import json
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SEED = 20261116

results = []


def check(name, condition, detail=""):
    results.append({"ok": bool(condition), "name": name, "detail": "" if condition else detail})
    return bool(condition)


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
    port = free_port()
    server = subprocess.Popen(
        ["node", str(ROOT / "serve.ts"), "--port", str(port)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    page_errors = []
    console_errors = []
    requests = []
    try:
        if not wait_for_server(port):
            raise SystemExit("static server did not start")
        base = f"http://127.0.0.1:{port}/"
        with sync_playwright() as p:
            browser = p.firefox.launch(headless=False)
            page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("request", lambda request: requests.append(request.url))

            page.goto(f"{base}?seed={SEED}&manual=1", wait_until="load")
            page.wait_for_function("() => !!window.__lumen", timeout=15000)
            page.wait_for_timeout(300)

            debug = lambda: page.evaluate("() => window.__lumen.debug()")
            advance = lambda seconds: page.evaluate("(s) => window.__lumen.advance(s)", seconds)
            intent = lambda **kwargs: page.evaluate("(i) => window.__lumen.setIntent(i)", kwargs)

            # --- title -------------------------------------------------------------------
            state = debug()
            check("title screen on load", state["screen"] == "title", state["screen"])
            samples = page.evaluate("() => window.__lumen.samplePixels(6)")
            distinct = len({tuple(pixel) for pixel in samples})
            check("canvas painted before any input", distinct >= 4, f"only {distinct} distinct sampled colours")

            # --- start -------------------------------------------------------------------
            page.keyboard.press("Space")
            advance(0.2)
            state = debug()
            check("Space starts a dive", state["screen"] == "play", state["screen"])
            check("dive starts on the surface with a full tank", state["depth"] < 5 and state["oxygen"] > 100, json.dumps(state))
            check("the dive-start sequence runs before the diver is released", state["intro"] > 0, f"intro {state['intro']}")
            check("the run starts in the upper trench", state["environment"] == "upper-trench", state["environment"])
            advance(1.4)
            check("the dive-start sequence releases the diver", debug()["intro"] == 0, f"intro {debug()['intro']}")
            start_oxygen = debug()["oxygen"]

            # The mechanic tests run in clear water: lures are spun up again for the hazard test.
            page.evaluate("() => { window.__lumen.world.lures = []; }")

            # --- descend with ballast ----------------------------------------------------
            intent(ballast=1.0, thrust=0.0, grapple=False, cut=False)
            advance(3.0)
            descended = debug()
            check("flooding ballast takes the diver down", descended["y"] > 300 and descended["depth"] > 10, json.dumps(descended))
            check("oxygen drains while diving", descended["oxygen"] < start_oxygen - 1, f"{start_oxygen} -> {descended['oxygen']}")

            # --- lateral thrust ----------------------------------------------------------
            before_x = descended["x"]
            intent(ballast=0.5, thrust=1.0)
            advance(1.0)
            moved = debug()
            check("lateral thrust moves the diver", moved["x"] > before_x + 30, f"{before_x} -> {moved['x']}")

            # --- grapple -----------------------------------------------------------------
            intent(ballast=0.5, thrust=0.0, grapple=False, cut=False)
            wreck = page.evaluate("() => window.__lumen.nearestWreck()")
            check("wrecks exist in the water", wreck is not None, "no wreck found")
            if wreck:
                page.evaluate("(w) => window.__lumen.teleport(w.x - 150, w.y)", wreck)
                intent(ballast=0.0, grapple=True, cut=False, aimX=wreck["x"], aimY=wreck["y"])
                for _ in range(12):
                    advance(0.1)
                    if debug()["hook"] == "attached":
                        break
                hooked = debug()
                check("the grapple attaches to the aimed wreck", hooked["hook"] == "attached", hooked["hook"])

                # --- cut a piece free ----------------------------------------------------
                # Stand beside the piece, hook the wreck from there and hold E: the cut is the
                # real one, at real range, with the tether under tension.
                node = page.evaluate("() => window.__lumen.nearestNode()")
                if node:
                    page.evaluate("(n) => { window.__lumen.teleport(n.x - 140, n.y); window.__lumen.world.player.ballast = 0.5; }", node)
                    intent(ballast=0.0, thrust=0.0, grapple=True, cut=True, aimX=node["x"], aimY=node["y"])
                    trace = []
                    for _ in range(14):
                        advance(0.15)
                        state = debug()
                        trace.append((state["hook"], state["cut"], state["cargo"], round(state["depth"])))
                        if state["cargo"] >= 1:
                            break
                    cut = debug()
                    check("cutting frees a piece into the hold", cut["cargo"] >= 1, json.dumps({"trace": trace, "stats": cut["stats"]}))
                    check("the freed piece carries value", cut["cargoValue"] > cut["banked"], f"value {cut['cargoValue']}")
                    check("a cut starts the salvage combo", cut["combo"] >= 1 and cut["multiplier"] >= 1, f"combo {cut['combo']} x{cut['multiplier']}")
                else:
                    check("cutting frees a piece into the hold", False, "no salvage node on the wreck")
                    check("the freed piece carries value", False, "no salvage node on the wreck")

            # --- new hazards and the deep band -------------------------------------------
            page.evaluate("() => { const w = window.__lumen.world; w.player.mercy = 0; w.player.hull = 100; const v = w.spawnVentAt(w.player.x, w.player.y + 40, 6.3); v.clock = 6.3; }")
            vent_before = debug()["hull"]
            advance(0.3)
            vented = debug()
            check("a silt vent blast damages the diver", vented["hull"] < vent_before, f"{vent_before} -> {vented['hull']}")
            page.evaluate("() => window.__lumen.teleport(700, 3200)")
            advance(0.2)
            deep = debug()
            check("the trench switches to the Black Shelf band", deep["environment"] == "black-shelf", deep["environment"])
            check("the deep band spawns its hazards", deep["vents"] + deep["wells"] > 0, f"vents {deep['vents']} wells {deep['wells']}")
            refit_keys = page.evaluate("() => Object.keys(window.__lumen.world.refits)")
            check("the new refits exist in the run state", all(key in refit_keys for key in ("servo", "deepHull", "sweep")), ",".join(refit_keys))

            # --- hazard damage -----------------------------------------------------------
            intent(ballast=0.0, grapple=False, cut=False)
            page.evaluate("() => { const w = window.__lumen.world; w.player.mercy = 0; w.player.hull = 100; const l = w.spawnLureAt(w.player.x, w.player.y); l.awake = 4; }")
            hull_before = 100
            lowest = 100
            for _ in range(24):
                advance(0.1)
                lowest = min(lowest, debug()["hull"])
            check("a lure damages the hull", lowest < hull_before, f"{hull_before} -> {lowest}")

            # --- surface and refit -------------------------------------------------------
            page.evaluate("() => window.__lumen.teleport(800, -90)")
            intent(ballast=0.0, grapple=False, cut=False)
            advance(0.4)
            surfaced = debug()
            check("surfacing opens the refit screen", surfaced["screen"] == "refit", surfaced["screen"])
            check("three refits are offered", len(surfaced["offers"]) == 3, str(surfaced["offers"]))
            banked = surfaced["banked"]
            check("the haul is banked on surfacing", banked > 0, str(banked))

            page.keyboard.press("Digit1")
            advance(0.4)
            refit = debug()
            check("choosing a refit starts the next dive", refit["screen"] == "play" and refit["dive"] == 1, json.dumps(refit))

            # --- pause -------------------------------------------------------------------
            page.keyboard.press("KeyP")
            advance(0.2)
            paused = debug()
            check("P pauses the dive", paused["screen"] == "paused", paused["screen"])
            frozen_at = paused["time"]
            advance(0.6)
            check("a paused dive does not advance", abs(debug()["time"] - frozen_at) < 0.05, f"{frozen_at} -> {debug()['time']}")
            page.keyboard.press("KeyP")
            advance(0.2)
            check("P resumes the dive", debug()["screen"] == "play", debug()["screen"])

            # --- lamp --------------------------------------------------------------------
            lamp_before = debug()["lamp"]
            page.keyboard.press("KeyF")
            advance(0.1)
            check("F switches the lamp", debug()["lamp"] != lamp_before, "lamp unchanged")

            # Clear the dive-start gate before the scripted deaths: the diver is not in the
            # water (and cannot be hurt) until the hatch opens.
            advance(1.4)

            # --- death and restart -------------------------------------------------------
            page.evaluate("() => { window.__lumen.world.player.hull = 0; window.__lumen.world.player.oxygen = 50; }")
            advance(0.2)
            over = debug()
            check("a broken hull ends the run", over["screen"] == "over", over["screen"])
            page.keyboard.press("Space")
            advance(2.4)
            restarted = debug()
            check("Space restarts instantly", restarted["screen"] == "play" and restarted["dive"] == 0, json.dumps(restarted))
            check("a restart clears the haul", restarted["banked"] == 0 and restarted["cargo"] == 0, json.dumps(restarted))
            check("a restart refills the tank", restarted["oxygen"] > 95, restarted["oxygen"])

            # --- win screen --------------------------------------------------------------
            page.evaluate("() => { const w = window.__lumen.world; w.banked = 1490; w.cargo.push({ kind: 'relic', label: 'relic', colour: '#7ef0c8', value: 40, mass: 2.8, x: w.player.x, y: w.player.y, phase: 0, spin: 0 }); w.player.y = -90; w.time = 5; }")
            intent(ballast=0.0)
            advance(1.4)
            won = debug()
            check("banking the contract target wins the run", won["screen"] == "won", won["screen"])

            # --- no network beyond the local server, no page errors ----------------------
            foreign = sorted({url for url in requests if not url.startswith(base.rstrip("/")) and not url.startswith("data:")})
            check("no request leaves the local server", not foreign, ", ".join(foreign[:5]))
            check("no page errors", not page_errors, "; ".join(page_errors[:3]))
            check("no console errors", not console_errors, "; ".join(console_errors[:3]))

            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    width = max(len(row["name"]) for row in results)
    print("")
    print(f"{'RESULT':6}  {'TEST':{width}}  DETAIL")
    print("-" * (width + 26))
    for row in results:
        print(f"{'PASS' if row['ok'] else 'FAIL':6}  {row['name']:{width}}  {row['detail']}")
    failed = [row for row in results if not row["ok"]]
    print("-" * (width + 26))
    print(f"{len(results) - len(failed)}/{len(results)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
