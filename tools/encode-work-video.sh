#!/usr/bin/env bash
# Reproducible encode of the Travailler videos (ARCHITECTURE-LOT4 §7, AUDIT-POIDS D4).
# H.264, 480 px wide, CRF 30 (33 if the Travailler budget beyond the base exceeds 190 KB),
# no audio, faststart; WebP posters (opening and last frame of each state), quality 70.
# Masters stay outside the repo. Usage: tools/encode-work-video.sh <source-dir> [crf]
set -euo pipefail
SRC=${1:?source dir with aoi-work.mp4, aoi-think.mp4, aoi-joy.mp4}
CRF=${2:-30}
OUT=public/game/work
mkdir -p "$OUT"
for s in work think joy; do
  ffmpeg -loglevel error -y -i "$SRC/aoi-$s.mp4" -an -vf "scale=480:-2,format=yuv420p" \
    -c:v libx264 -preset veryslow -crf "$CRF" -profile:v main -movflags +faststart \
    -map_metadata -1 "$OUT/aoi-$s.mp4"
  ffmpeg -loglevel error -y -i "$OUT/aoi-$s.mp4" -frames:v 1 -c:v libwebp -quality 70 \
    "$OUT/aoi-$s-start.webp"
  [ "$s" = work ] && continue # the work still is its opening frame
  ffmpeg -loglevel error -y -sseof -0.1 -i "$OUT/aoi-$s.mp4" -update 1 -frames:v 1 \
    -c:v libwebp -quality 70 "$OUT/aoi-$s-end.webp"
done
ls -l "$OUT"
