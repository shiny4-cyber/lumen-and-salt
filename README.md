# LUMEN &amp; SALT

[![make.fun best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/shiny4-cyber/lumen-and-salt/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/shiny4-cyber/lumen-and-salt/reward.svg)](https://make.fun/bounty/best-game-01)

An entry for **make.fun best-game-01 — "make the best game"**.

*Lumen & Salt* is a 2D risk/reward diving game. You pilot a tethered bathyscaphe into the
Halcyon Trench, grapple drifting wrecks, cut salvage free, feel the weight of it on the way
up, dodge lures that hunt your lamp, and surface before the air runs out. The contract is
closed at **$1,500 banked**; the run ends on a hull breach or an empty tank.

Everything here is original for this entry: no engine, no library, no sampled audio, no
borrowed art. The whole game is static files under `game/`, played with keyboard and mouse.

## Run it

```bash
node serve.ts            # http://localhost:8080  (any static server works)
```

`game/index.html` is the game. It runs from `file://` too, but a static server is the honest
way to test it: `node serve.ts --port 8080`.

## Hand it in

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and writes
`dossier.json` with the kit's own `buildDossier` (the copy in `vendor/makefun-game.ts`, byte
for byte the kit's). `/output` is the grader's path; `MAKEFUN_OUTPUT_DIR` stands in outside it.

## Test it

```bash
node test/logic.test.mjs                  # 36 headless fixed-step tests over the real simulation
xvfb-run -a python3 test/browser_test.py  # 44 real-browser tests (Playwright + Firefox, headed)
xvfb-run -a python3 tools/capture.py      # re-shoot the four entry screenshots
/usr/bin/python3 tools/verify_shots.py     # gate limits, luminance and a text preview per shot
node tools/gate_check.mjs                 # the gate rows, checked against out/ (run main.ts first)
node tools/autoplay.mjs 16                # a naive bot plays 16 seeds: the tuning probe
```

The browser tests and the capture script need the interpreter whose Playwright knows the
installed Firefox revision, and a headed Firefox under Xvfb: headless Firefox on this host
does not composite the canvas into screenshots. All three scripts run the game's own
simulation through `window.__lumen` (fixed step, `?manual=1`), not a mock.

## Controls

| input | action |
| --- | --- |
| A / D, ← / → | lateral thrust |
| W / S, ↑ / ↓ | vent (rise) or flood (sink) ballast — the ballast setting is the ascent speed |
| hold left mouse | fire the grapple toward the pointer, and stay tethered |
| hold E | cut the nearest salvage piece free while tethered |
| F | lamp on/off: it lights the wreck, and it wakes the lures |
| Q | sonar ping: reveal and drowse everything nearby (9 s cooldown) |
| P / Esc | pause |
| 1 / 2 / 3 or click | choose a refit after surfacing (thirteen exist; six are trades) |
| SPACE | start, restart, resume |
| M | mute |

## The loop

1. **Dive.** Oxygen is the clock: 0.55/s plus 0.01/s per metre, from a 110-second tank. Deeper
   wrecks pay more (depth tiers value the same piece at ×1 to ×2.2) and cost more air.
2. **Grapple.** The hook flies 560 px at 1550 px/s and bites a wreck. Once attached a spring
   pulls you toward the anchor; the wreck answers 18% of the pull. A tether stretched 250 px
   past its rest length snaps.
3. **Cut.** Hold E beside a piece: 1.35 s of cutting per piece, minus winch and lens upgrades. Every piece cut
   inside a 7.5 s window raises the salvage combo by 0.25, to x2.5; let the window lapse and it resets. Every cut
   costs the wreck one integrity. At zero the hull buckles and collapses 2.1 s later, damaging
   anything within 190 px and destroying the pieces still on it.
4. **Carry.** Each piece has mass. Mass slows thrust and adds sink, so a rich hold is a slow,
   exposed ascent — that is the risk/reward decision in the middle of every dive.
5. **Surface.** Cargo is banked into the contract total and the refit screen offers three of
   seven upgrades (tank, winch, plating, lens, silent propeller, ballast pump, cargo clamps).
6. **Close the contract** at $1,500, or lose the boat to the hull or the air. SPACE restarts.

Hazards are deterministic so they can be learned: lures patrol a figure-eight and only chase
when your lamp wakes them (they forget 1.8 s after it goes out, and a lure that lands a hit
recoils for 2.4 s so a pack cannot chain-hit you), currents run in visible bands every 620 px,
and collapsing hulls announce themselves with a shake and a warning line.

Below 75 m the trench becomes the **Black Shelf**: currents are 55% stronger, wrecks spawn 42%
denser, every piece pays 34% more, and two more hazards appear. Below 150 m it becomes the
**Brine Hollow**: rust water, currents x1.9, wrecks 75% denser, salvage x1.8, and a roaming
**glassmaw** that locks a lane on you, telegraphs it for 1.25 s, then charges down it. **Silt vents** run an 8 s cycle
and telegraph for 1.4 s before a 1.8 s upward blast that hurts and shoves. **Pressure wells**
run a 9 s cycle, contracting their rings for 1.5 s before a 4 s pull; the outer ring is
escapable, the 29 px core is not. Both are drawn on screen and both are on a fixed clock.

**Q** fires a sonar ping (620 px, 2.6 s, 9 s cooldown): it reveals wrecks, lures and the
glassmaw, and drowses everything inside it. **Ascent pressure** is the other half of ballast:
above 165 px/s the bend builds and then the hull takes damage, and the HUD shows SAFE / FAST
ASCENT / BEND. Three **yard contracts** are rolled from the run seed (bank, cut, depth, dives,
tonnage, a drowned bell, a combo), tracked in the HUD and paid once; the refit screen shows the
last dive's earned, tonnage, losses and contract money.

Eight salvage classes each have their own mass, value and cut time, so a drowned bell is a
3.1 s commitment worth $330 and a brine pearl is under a second and worth $92.

The balance was set with `tools/autoplay.mjs`: a deliberately naive bot — nearest wreck,
grapple, cut three, dodge, surface at 30% air — closes the contract on about one seed in five
and averages a few hundred dollars. A player who plans a route does better; the game never
becomes free.

## Design and structure

`game/DESIGN.json` is the machine-readable note: controls, systems, loop, file map. The
short version — one job per file, a fixed 1/60 s step separated from rendering:

```
game/index.html          the page
game/src/main.js         loop, screen state machine, audio cues, test hooks
game/src/config.js       all tuning, palette, player-facing strings
game/src/world.js        dive state, spawn director, step composition, scoring
game/src/player.js       ballast/buoyancy/thrust/oxygen/hull
game/src/grapple.js      hook flight, tether spring, snaps, cutting
game/src/wrecks.js       wreck build, drift, integrity, collapse
game/src/hazards.js      lures: patrol, lamp-woken chase, recoil
game/src/currents.js     current band generation and force sampling
game/src/vents.js        silt vents: telegraph, blast, push
game/src/pressure-wells.js  pressure wells: rest, warning, pull, core damage
game/src/environment.js  three depth bands: palettes, hazard mix, density, salvage tables
game/src/elites.js       the glassmaw: prowl, locked-lane windup, dash, recovery
game/src/sonar.js        the sonar ping: radius, active window, cooldown
game/src/contracts.js    the yard contract board: roll, live progress, payout
game/src/economy.js      salvage combo: multiplier, decay window, payout
game/src/salvage.js      value table, depth tiers, cargo mass
game/src/upgrades.js     the thirteen refits (six are trades)
game/src/particles.js    fixed pools for bubbles, silt, sparks, debris
game/src/render.js       the scene painter, lamp cone included
game/src/hud.js          oxygen, depth, cargo, hull, timers, prompts
game/src/screens.js      title, pause, refit, game over, contract complete
game/src/shots.js        deterministic staging for the screenshots
game/src/input.js        keyboard + pointer state
game/src/audio.js        WebAudio synthesis (no audio files)
game/src/random.js       seeded mulberry32
game/src/mathx.js        small maths helpers
```

## Limitations, honestly

- Visual quality of the screenshots is checked numerically (dimensions, byte cap, luminance
  mean/spread, dark fraction, colour count, HUD brightness, an ASCII preview) and by DOM
  assertions at the shutter. The vision reviewer on the build host returns 403, so **no
  model has looked at these images**; legibility is asserted, not seen.
- Determinism is proven for the simulation with one seed and identical intents, and for the
  dossier by building it twice and comparing bytes. Screenshot bytes depend on the browser's
  JPEG encoder and font rasterisation, so they are re-shot rather than reproduced bit-exactly.
- The game is tuned for a keyboard and mouse on a desktop; there are no touch controls.
- Sound needs a user gesture (browser policy); the first click or key starts the synthesiser.

## Licence

MIT — see `LICENSE`.
