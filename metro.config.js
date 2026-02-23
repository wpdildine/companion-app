const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const runtimePath = path.resolve(projectRoot, 'node_modules/@mtg/runtime');
const watchFolders = fs.existsSync(runtimePath) ? [runtimePath] : [];

const config = {
  watchFolders,
  resolver: {
    resolverMainFields: ['react-native', 'browser', 'main'],
    blockList: [
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]react[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]react-native[\\/].*/,
    ],
    // Force @mtg/runtime to use the RN entry so we don't pull in Node (fs, better-sqlite3)
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@mtg/runtime' && platform) {
        const rnEntry = path.join(runtimePath, 'dist', 'index.rn.js');
        if (fs.existsSync(rnEntry)) {
          return { type: 'sourceFile', filePath: rnEntry };
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
