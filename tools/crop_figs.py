#!/usr/bin/env python3
"""Crop paper figures to their real content and blend them into the page.

Two jobs, both verified with pixel evidence:
  1. CROP: render each PDF, find content row-bands, drop stray leading/trailing
     bands that are short AND isolated (the teaser's palette-swatch block is one
     such band), keep the union of the remaining bands, then column-crop. This
     removes the wide white margins and the stray swatch grid.
  2. BLEND: recolor the near-white figure canvas to the page background
     (--bg = #F7F8FA) so the figure sits ON the porcelain page with no white
     card behind it. Pale figure elements (blue headers, photos) are untouched.

Re-run after any figure change:
    tools/.venv/bin/python tools/crop_figs.py
"""

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path("/Users/lijingliang/Downloads/Survey_Tactile_Force_aware_Robot_Learning___clean/figs")
OUT = ROOT / "assets" / "images"
PDFTOCAIRO = "/opt/homebrew/bin/pdftocairo"
CWEBP = "/opt/homebrew/bin/cwebp"

FIGURES = ["teaser", "framework_fusion", "framework_phase1",
           "framework_phase2", "framework_control"]

PAGE_BG = (247, 248, 250)   # --bg porcelain; figure white is recolored to this
DPI = 220
PAD = 22                    # px of breathing room kept around the content
NEAR_WHITE = 246            # min channel >= this counts as background white


def render(name: str, tmp: Path) -> Image.Image:
    stem = tmp / name
    subprocess.run([PDFTOCAIRO, "-png", "-r", str(DPI), "-singlefile",
                    str(SRC / f"{name}.pdf"), str(stem)], check=True)
    return Image.open(f"{stem}.png").convert("RGB")


def content_bands(mask: np.ndarray, axis: int, on=0.004, gap=40):
    """Contiguous runs along `axis` whose content density exceeds `on`,
    merged across whitespace gaps up to `gap` px. Returns [(start, end, len)]."""
    den = mask.mean(axis=1 - axis)
    onrow = den > on
    n = len(onrow)
    bands, i = [], 0
    while i < n:
        if not onrow[i]:
            i += 1
            continue
        j, k, g = i, i, 0
        while k < n:
            if onrow[k]:
                j, g = k, 0
            else:
                g += 1
                if g > gap:
                    break
            k += 1
        bands.append((i, j, j - i))
        i = k
    return bands


def keep_range(bands):
    """Drop leading/trailing bands that are short (<25% of the tallest) and
    therefore stray; keep the union span of what remains."""
    if not bands:
        return None
    tallest = max(b[2] for b in bands)
    kept = [b for b in bands if b[2] >= 0.25 * tallest]
    return (kept[0][0], kept[-1][1])


def crop(img: Image.Image):
    a = np.asarray(img)
    H, W, _ = a.shape
    content = a.min(axis=2) < NEAR_WHITE

    rb = content_bands(content, axis=0)
    rrange = keep_range(rb)
    if rrange is None:
        return img, {"skipped": "no content"}
    y0, y1 = rrange

    sub = content[y0:y1 + 1]
    cb = content_bands(sub, axis=1)
    crange = keep_range(cb)
    x0, x1 = crange if crange else (0, W - 1)

    y0 = max(0, y0 - PAD); y1 = min(H - 1, y1 + PAD)
    x0 = max(0, x0 - PAD); x1 = min(W - 1, x1 + PAD)
    return img.crop((x0, y0, x1 + 1, y1 + 1)), {
        "orig": (W, H), "crop": (x1 - x0 + 1, y1 - y0 + 1),
        "row_bands": rb, "col_bands": cb,
    }


def blend_to_page(img: Image.Image) -> Image.Image:
    """Recolor near-white pixels to the page background so the figure has no
    visible white card. Soft ramp over [NEAR_WHITE-6, 255] avoids a hard edge."""
    a = np.asarray(img).astype(np.float32)
    mn = a.min(axis=2)
    lo, hi = NEAR_WHITE - 6, 255.0
    t = np.clip((mn - lo) / (hi - lo), 0.0, 1.0)[..., None]   # 0..1 whiteness
    bg = np.array(PAGE_BG, dtype=np.float32)
    out = a * (1 - t) + bg * t
    return Image.fromarray(out.round().astype(np.uint8), "RGB")


def saturated_fraction(img: Image.Image, top_frac=0.10) -> float:
    a = np.asarray(img.convert("RGB"))
    strip = a[: max(1, int(a.shape[0] * top_frac))]
    sat = (strip.max(axis=2).astype(int) - strip.min(axis=2)) > 40
    return float(sat.mean())


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failures = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for name in FIGURES:
            img = render(name, tmp)
            cropped, info = crop(img)
            blended = blend_to_page(cropped)

            cw, ch = blended.size
            ar = cw / ch
            ok = cw >= 1100 and 0.4 <= ar <= 4.0
            note = ""
            if name == "teaser":
                top_sat = saturated_fraction(blended)
                note = f" top_sat={top_sat:.4f}"
                if top_sat >= 0.01:
                    ok = False
                    note += " <-- SWATCH BLOCK STILL PRESENT"

            png = OUT / f"{name}.png"
            blended.save(png, optimize=True)
            subprocess.run([CWEBP, "-q", "88", str(png), "-o",
                            str(OUT / f"{name}.webp")],
                           check=True, capture_output=True)

            print(f"{'OK ' if ok else 'BAD'} {name:18s} "
                  f"{info['orig'][0]}x{info['orig'][1]} -> {cw}x{ch} "
                  f"(AR {ar:.2f}){note}")
            if not ok:
                failures.append(name)

    if failures:
        print("\nFAILURES:", failures)
        return 1
    print("\nAll figures cropped, blended to page bg, and re-encoded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
