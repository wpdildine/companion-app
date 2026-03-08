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
    // Resolve @babel/runtime from app node_modules when bundling symlinked @mtg/runtime
    // (files under mtg_rules/runtime-ts otherwise fail to resolve this)
    extraNodeModules: {
      '@babel/runtime': path.resolve(projectRoot, 'node_modules/@babel/runtime'),
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
      'expo-audio': path.resolve(projectRoot, 'node_modules/expo-audio'),
      three: path.resolve(projectRoot, 'node_modules/three'),
      '@react-three/fiber': path.resolve(projectRoot, 'node_modules/@react-three/fiber'),
    },
    blockList: [
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]react[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]react-native[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]three[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]@react-three[\\/]fiber[\\/].*/,
    ],
    // Force @mtg/runtime to use the RN entry so we don't pull in Node (fs, better-sqlite3)
    // Force a single resolution for 'three' so R3F and app code share one instance (avoids "Multiple instances of Three.js" warning)
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@mtg/runtime' && platform) {
        const rnEntry = path.join(runtimePath, 'dist', 'index.rn.js');
        if (fs.existsSync(rnEntry)) {
          return { type: 'sourceFile', filePath: rnEntry };
        }
      }
      if (moduleName === 'three') {
        const threeCjs = path.join(projectRoot, 'node_modules', 'three', 'build', 'three.cjs');
        if (fs.existsSync(threeCjs)) {
          return { type: 'sourceFile', filePath: threeCjs };
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
