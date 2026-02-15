#!/usr/bin/env bash
# Download a Piper TTS voice from Hugging Face (rhasspy/piper-voices) into the plugin assets.
# Run from anywhere: ./scripts/download-piper-voice.sh  (or from repo root)
# Voice format: VOICE=lessac QUALITY=medium (default) -> en_US-lessac-medium
# QUALITY can be: x_low, low, medium, high

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -d "plugins/piper-tts" ]]; then
  echo "Error: plugins/piper-tts not found. Run this from the companion-app repo root (or use ./scripts/download-piper-voice.sh)." >&2
  exit 1
fi

VOICE="${VOICE:-lessac}"
QUALITY="${QUALITY:-medium}"
NAME="en_US-${VOICE}-${QUALITY}"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/${VOICE}/${QUALITY}/${NAME}"
PLUGIN="plugins/piper-tts"

echo "Piper TTS: downloading voice ${NAME}..."

mkdir -p "${PLUGIN}/android/src/main/assets/piper"
curl -L -o "${PLUGIN}/android/src/main/assets/piper/model.onnx" "${BASE}.onnx"
curl -L -o "${PLUGIN}/android/src/main/assets/piper/model.onnx.json" "${BASE}.onnx.json"

mkdir -p "${PLUGIN}/ios/Resources/piper"
cp "${PLUGIN}/android/src/main/assets/piper/model.onnx" "${PLUGIN}/ios/Resources/piper/"
cp "${PLUGIN}/android/src/main/assets/piper/model.onnx.json" "${PLUGIN}/ios/Resources/piper/"

echo ""
echo "Done. Model files are in:"
echo "  - ${PLUGIN}/android/src/main/assets/piper/"
echo "  - ${PLUGIN}/ios/Resources/piper/"
echo "If you already had the app built, run: cd ios && pod install"
