const path = require('path');

/**
 * Local plugin root for piper-tts.
 *
 * pnpm handles file: deps differently (copy or store link), so node_modules/piper-tts
 * may not be a symlink to plugins/piper-tts and can be stale or missing the podspec at
 * package root. Explicitly pointing the CLI at the source folder ensures autolinking
 * and native builds use plugins/piper-tts (podspec, iOS/Android code, assets).
 */
module.exports = {
  dependencies: {
    'piper-tts': {
      root: path.join(__dirname, 'plugins/piper-tts'),
    },
  },
};
