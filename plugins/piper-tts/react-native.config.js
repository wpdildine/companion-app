const path = require('path');

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: path.join(__dirname, 'android'),
        packageImportPath: 'import com.pipertts.PiperTtsPackage;',
        packageInstance: 'new PiperTtsPackage()',
      },
      ios: {
        // Podspec at package root (PiperTts.podspec) is found by findPodspec when root is plugins/piper-tts
      },
    },
  },
};
