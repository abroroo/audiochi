#!/usr/bin/env bash
# Out-of-set speech for the unknown-sound study: macOS text-to-speech, 12 voices x 3 sentences, 16 kHz mono.
set -euo pipefail
command -v say >/dev/null || { echo "needs macOS 'say'"; exit 1; }
mkdir -p .data/ood && cd .data/ood
i=0
for v in Albert Aman Daniel Fred Karen Moira Rishi Samantha Tessa Ralph Kathy Junior; do
  for s in "Good morning, can you hear me over there? I think the meeting starts at ten." \
           "This is a short recording of someone talking normally in a quiet room." \
           "Please remember to buy milk, bread and some apples on the way home."; do
    say -v "$v" -o tmp.aiff "$s"
    afconvert -f WAVE -d LEI16@16000 -c 1 tmp.aiff "speech_$i.wav"
    i=$((i + 1))
  done
done
rm -f tmp.aiff
echo "wrote $i clips to .data/ood"
