#!/bin/sh
# Turns raw Mac screenshots into Chrome Web Store screenshots (1280x800, no alpha).
#   store-assets/raw/<n>-<name>.png  ->  store-assets/screenshots/<n>-<name>.jpg
# Only files starting with a digit are processed, so drafts can sit in raw/ too.
# Wider-than-16:10 shots are trimmed from the left (the video side) so the
# sidebar on the right stays whole; taller ones are trimmed from the top, which
# also drops the macOS menu bar when a full-screen capture includes it.
set -e
cd "$(dirname "$0")/../store-assets"
mkdir -p screenshots

# Crops with CoreGraphics (top-left origin). sips --cropOffset is not reliable.
crop() { # src out x y w h
  osascript -l JavaScript - "$@" <<'EOF' >/dev/null
ObjC.import('AppKit');
function run([src, out, x, y, w, h]) {
  const rep = $.NSBitmapImageRep.imageRepWithData($.NSData.dataWithContentsOfFile(src));
  const cg = $.CGImageCreateWithImageInRect(rep.CGImage, $.CGRectMake(+x, +y, +w, +h));
  const png = $.NSBitmapImageRep.alloc.initWithCGImage(cg).representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  png.writeToFileAtomically(out, true);
}
EOF
}

for src in raw/[0-9]*.png; do
  [ -e "$src" ] || continue
  out="screenshots/$(basename "${src%.png}").jpg"
  w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/ {print $2}')
  tmp=$(mktemp -t svm).png
  if [ $((w * 10)) -gt $((h * 16)) ]; then
    cw=$((h * 16 / 10))
    crop "$PWD/$src" "$tmp" $((w - cw)) 0 "$cw" "$h"
  else
    ch=$((w * 10 / 16))
    crop "$PWD/$src" "$tmp" 0 $((h - ch)) "$w" "$ch"
  fi
  sips -z 800 1280 -s format jpeg -s formatOptions 90 "$tmp" --out "$out" >/dev/null
  rm -f "$tmp"
  echo "$out"
done
