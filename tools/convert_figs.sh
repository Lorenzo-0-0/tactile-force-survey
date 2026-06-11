#!/bin/zsh
# Convert the 6 survey figure PDFs to PNG (220 dpi) + WebP (q88) in
# assets/images/. Keeps both formats. Re-runnable.
set -euo pipefail

FIGS_DIR="/Users/lijingliang/Downloads/Survey_Tactile_Force_aware_Robot_Learning___clean/figs"
SITE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$SITE_ROOT/assets/images"
PDFTOCAIRO=/opt/homebrew/bin/pdftocairo
CWEBP=/opt/homebrew/bin/cwebp

mkdir -p "$OUT_DIR"

NAMES=(teaser framework_fusion framework_phase1 framework_phase2 framework_control task_histogram)

printf "%-20s %-12s %10s %10s\n" name dimensions png webp
for name in "${NAMES[@]}"; do
  src="$FIGS_DIR/$name.pdf"
  if [[ ! -f "$src" ]]; then
    echo "FATAL: missing $src" >&2
    exit 1
  fi
  "$PDFTOCAIRO" -png -r 220 -singlefile "$src" "$OUT_DIR/$name"
  "$CWEBP" -quiet -q 88 "$OUT_DIR/$name.png" -o "$OUT_DIR/$name.webp"
  dims=$(sips -g pixelWidth -g pixelHeight "$OUT_DIR/$name.png" 2>/dev/null \
         | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%dx%d", w, h}')
  png_sz=$(du -h "$OUT_DIR/$name.png" | cut -f1)
  webp_sz=$(du -h "$OUT_DIR/$name.webp" | cut -f1)
  printf "%-20s %-12s %10s %10s\n" "$name" "$dims" "$png_sz" "$webp_sz"
done
