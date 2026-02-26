#!/usr/bin/env bash
# Download and build espeak-ng-data into the Piper TTS plugin resources (iOS bundle / Android assets).
# Run from repo root: ./scripts/download-espeak-ng-data.sh
# Requires: cmake, C compiler (Xcode CLI or brew install cmake). Needed for phontab/phondata/phonindex.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -d "plugins/piper-tts" ]]; then
  echo "Error: plugins/piper-tts not found. Run from companion-app repo root." >&2
  exit 1
fi

# espeak-ng-data: repo only has lang/ and voices/; phontab, phondata, phonindex are built from source
ESPEAK_REPO="${ESPEAK_REPO:-https://github.com/espeak-ng/espeak-ng}"
ESPEAK_IOS="plugins/piper-tts/ios/Resources/espeak-ng-data"
ESPEAK_ANDROID="plugins/piper-tts/android/src/main/assets/espeak-ng-data"
TMP_CLONE="$REPO_ROOT/vendor/espeak-ng-clone"
ESPEAK_BUILD="$TMP_CLONE/build"

echo "Downloading espeak-ng (clone/update)..."

mkdir -p "$(dirname "$TMP_CLONE")"
if [[ -d "$TMP_CLONE/.git" ]]; then
  (cd "$TMP_CLONE" && git pull --depth 1)
else
  rm -rf "$TMP_CLONE"
  git clone --depth 1 "$ESPEAK_REPO" "$TMP_CLONE"
fi

# Build compiled data (phontab, phondata, phonindex, intonations, dicts) so runtime finds them
if ! command -v cmake &>/dev/null; then
  echo "Error: cmake is required to build espeak-ng data (phontab etc.). Install with: brew install cmake" >&2
  exit 1
fi
echo "Building espeak-ng data (phontab, phondata, phonindex, intonations)..."
mkdir -p "$ESPEAK_BUILD"
(cd "$ESPEAK_BUILD" && cmake .. -DCOMPILE_INTONATIONS=ON -DBUILD_SHARED_LIBS=OFF -DENABLE_TESTS=OFF)
(cd "$ESPEAK_BUILD" && cmake --build . --target data)

# Use built data dir (has phontab, phondata, phonindex, lang, voices, *_dict)
DATA_SRC="$ESPEAK_BUILD/espeak-ng-data"
if [[ ! -f "$DATA_SRC/phontab" ]]; then
  echo "Error: build did not produce phontab at $DATA_SRC" >&2
  exit 1
fi

rm -rf "$ESPEAK_IOS"
cp -R "$DATA_SRC" "$ESPEAK_IOS"

# Mirror to Android assets so the plugin can copy to filesDir at runtime
rm -rf "$ESPEAK_ANDROID"
mkdir -p "$(dirname "$ESPEAK_ANDROID")"
cp -R "$ESPEAK_IOS" "$ESPEAK_ANDROID"

# iOS: vendor public C API headers so PiperTts pod can compile with PIPER_USE_ESPEAK=1 (#include <espeak-ng/speak_lib.h>)
ESPEAK_IOS_INCLUDE="plugins/piper-tts/ios/Include"
rm -rf "$ESPEAK_IOS_INCLUDE"
mkdir -p "$ESPEAK_IOS_INCLUDE"
cp -R "$TMP_CLONE/src/include/espeak-ng" "$ESPEAK_IOS_INCLUDE"

echo "Done. espeak-ng-data is at:"
echo "  - $ESPEAK_IOS (iOS bundle)"
echo "  - $ESPEAK_ANDROID (Android assets)"
echo "  - $ESPEAK_IOS_INCLUDE (iOS C API headers for PiperTts when PIPER_USE_ESPEAK=1)"
echo "Re-run 'cd ios && pod install' if needed."
