#!/bin/sh
# Turns raw Mac screenshots into Chrome Web Store screenshots (1280x800, no alpha).
#   store-assets/raw/<n>-<name>.png  ->  store-assets/screenshots/<n>-<name>.jpg
# Only files starting with a digit are processed, so drafts can sit in raw/ too.
# Wider-than-16:10 shots are trimmed from the left (the video side) so the
# sidebar on the right stays whole; taller ones are trimmed from the bottom.
set -e
cd "$(dirname "$0")/../store-assets"
mkdir -p screenshots
for src in raw/[0-9]*.png; do
  [ -e "$src" ] || continue
  out="screenshots/$(basename "${src%.png}").jpg"
  w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/ {print $2}')
  tmp=$(mktemp -t svm).png
  if [ $((w * 10)) -gt $((h * 16)) ]; then
    cw=$((h * 16 / 10))
    sips --cropToHeightWidth "$h" "$cw" --cropOffset 0 $((w - cw)) "$src" --out "$tmp" >/dev/null
  else
    ch=$((w * 10 / 16))
    sips --cropToHeightWidth "$ch" "$w" --cropOffset 0 0 "$src" --out "$tmp" >/dev/null
  fi
  sips -z 800 1280 -s format jpeg -s formatOptions 90 "$tmp" --out "$out" >/dev/null
  rm -f "$tmp"
  echo "$out"
done
