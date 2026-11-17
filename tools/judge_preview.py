"""What the judge actually sees: the contact sheet's own scale.

The competition fits the cover inside 768x480 (never enlarged) and the other screenshots into
smaller cells, so every screenshot is re-sampled to 768 px wide here and the resulting text
heights are printed. A label is only worth trusting if it stays readable at this scale.

Run: /usr/bin/python3 tools/judge_preview.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots" / "judge"
WIDTH = 768

# The type sizes the game draws with, in canvas pixels (see game/src/hud.js and screens.js).
CANVAS_TEXT = {
    "hud label": 19,
    "hud value": 26,
    "hud number": 40,
    "hud depth": 52,
    "hud prompt": 20,
    "screen title": 58,
    "screen row": 21,
    "screen hint": 19,
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for shot in sorted(ROOT.glob("screenshots/*.jpg")):
        image = Image.open(shot).convert("RGB")
        height = round(image.height * WIDTH / image.width)
        sheet = image.resize((WIDTH, height), Image.LANCZOS)
        target = OUT / shot.name
        sheet.save(target, quality=88)
        print(f"{shot.name:14} {image.width}x{image.height} -> {sheet.width}x{sheet.height}  {target.stat().st_size:>6} B")
    scale = WIDTH / 1280
    print(f"\nscale on the sheet: {scale:.2f}")
    for name, size in CANVAS_TEXT.items():
        print(f"  {name:14} {size:>3} px -> {size * scale:>5.1f} px")


if __name__ == "__main__":
    main()
