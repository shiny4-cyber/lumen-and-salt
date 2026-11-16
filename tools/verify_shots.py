"""Programmatic verification of the entry screenshots.

Vision review is not available on this host, so the checks are numeric: format, dimensions,
byte cap, mean luminance, luminance spread, dark fraction, colour variety, and an ASCII
luminance preview so a human can read the composition without an image viewer.

Run:  /usr/bin/python3 tools/verify_shots.py
"""

import sys
from pathlib import Path

from PIL import Image

SHOTS = Path(__file__).resolve().parent.parent / "screenshots"
LIMITS = {"max_bytes": 262144, "long_side": 1280, "short_side": 480, "count": (3, 4)}
RAMP = " .:-=+*#%@"


def stats(path):
    raw = path.read_bytes()
    image = Image.open(path)
    width, height = image.size
    grey = image.convert("L")
    pixels = list(grey.getdata())
    total = len(pixels)
    mean = sum(pixels) / total
    variance = sum((value - mean) ** 2 for value in pixels) / total
    dark = sum(1 for value in pixels if value < 24) / total
    bright = sum(1 for value in pixels if value > 180) / total
    colours = len(image.convert("RGB").getcolors(maxcolors=200000) or [])
    # HUD band: the top eighth of the frame must carry text, not just water.
    hud = grey.crop((0, 0, width, int(height * 0.16)))
    hud_pixels = list(hud.getdata())
    hud_bright = sum(1 for value in hud_pixels if value > 150) / len(hud_pixels)
    return {
        "bytes": len(raw),
        "width": width,
        "height": height,
        "mean": round(mean, 1),
        "stdev": round(variance ** 0.5, 1),
        "dark_fraction": round(dark, 3),
        "bright_fraction": round(bright, 4),
        "colours": colours,
        "hud_bright_fraction": round(hud_bright, 4),
        "raw": raw,
        "image": image,
    }


def preview(image, columns=64, rows=26):
    small = image.convert("L").resize((columns, rows))
    pixels = list(small.getdata())
    lines = []
    for row in range(rows):
        line = "".join(RAMP[min(len(RAMP) - 1, pixels[row * columns + col] * len(RAMP) // 256)] for col in range(columns))
        lines.append(line)
    return "\n".join(lines)


def main():
    files = sorted(path for path in SHOTS.iterdir() if path.suffix.lower() in (".jpg", ".jpeg", ".png") and not path.name.startswith("."))
    failures = []
    if not (LIMITS["count"][0] <= len(files) <= LIMITS["count"][1]):
        failures.append(f"expected 3 or 4 screenshots, found {len(files)}")
    for path in files:
        info = stats(path)
        long_side = max(info["width"], info["height"])
        short_side = min(info["width"], info["height"])
        problems = []
        if info["bytes"] > LIMITS["max_bytes"]:
            problems.append("over 256 KiB")
        if long_side > LIMITS["long_side"]:
            problems.append(f"long side {long_side}")
        if short_side < LIMITS["short_side"]:
            problems.append(f"short side {short_side}")
        if info["stdev"] < 12:
            problems.append(f"flat frame (stdev {info['stdev']})")
        if info["dark_fraction"] > 0.92:
            problems.append(f"nearly black (dark {info['dark_fraction']})")
        if info["colours"] < 500:
            problems.append(f"too few colours ({info['colours']})")
        play_scene = path.name.startswith("1-") or path.name.startswith("3-")
        if play_scene and info["hud_bright_fraction"] < 0.002:
            problems.append("no bright HUD pixels in the top band")
        if not play_scene and info["bright_fraction"] < 0.002:
            problems.append("no bright type on the overlay")
        print(f"\n{path.name}: {info['width']}x{info['height']} {info['bytes']} bytes  mean {info['mean']}  stdev {info['stdev']}  "
              f"dark {info['dark_fraction']}  bright {info['bright_fraction']}  colours {info['colours']}  hud {info['hud_bright_fraction']}")
        print(preview(info["image"]))
        if problems:
            failures.append(f"{path.name}: {', '.join(problems)}")
    if failures:
        print("\nFAIL")
        for failure in failures:
            print(" -", failure)
        return 1
    print(f"\nPASS: {len(files)} screenshots within every gate limit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
