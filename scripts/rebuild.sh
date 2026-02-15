#!/usr/bin/env bash
# Full rebuild: clean, download assets, install deps, pod install.
# Run from repo root: pnpm run rebuild   (or ./scripts/rebuild.sh)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "[rebuild] 1/4 Cleaning native build folders..."
node scripts/clean-build.js

echo "[rebuild] 2/4 Downloading Piper voice..."
./scripts/download-piper-voice.sh

echo "[rebuild] 3/4 Downloading espeak-ng-data..."
./scripts/download-espeak-ng-data.sh

echo "[rebuild] 4/4 Installing iOS Pods (with Piper espeak enabled)..."
(cd ios && PIPER_USE_ESPEAK=1 pod install)

echo "[rebuild] Done. Run pnpm run ios or pnpm run android to build and run."
