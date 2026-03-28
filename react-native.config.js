const path = require('path');

/**
 * Local plugin roots for file: dependencies with native code.
 *
 * pnpm handles file: deps differently (copy or store link), so node_modules plugin
 * paths may not be symlinks to plugins/* and can be stale or incomplete for native
 * autolinking. Point the RN CLI at the source folders so iOS/Android resolve the
 * intended podspecs, package classes, and source dirs.
 */
module.exports = {
  assets: ['./assets/fonts/'],
  dependencies: {
    'piper-tts': {
      root: path.join(__dirname, 'plugins/piper-tts'),
      platforms: {
        android: {
          sourceDir: path.join(__dirname, 'plugins/piper-tts/android'),
          packageImportPath: 'import com.pipertts.PiperTtsPackage;',
          packageInstance: 'new PiperTtsPackage()',
        },
      },
    },
    'atlas-native-mic': {
      root: path.join(__dirname, 'plugins/atlas-native-mic'),
      platforms: {
        android: {
          sourceDir: path.join(__dirname, 'plugins/atlas-native-mic/android'),
          packageImportPath: 'import com.atlasnativemic.AtlasNativeMicPackage;',
          packageInstance: 'new AtlasNativeMicPackage()',
        },
      },
    },
  },
};
