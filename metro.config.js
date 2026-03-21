const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {
  withStorybook,
} = require('@storybook/react-native/metro/withStorybook');

const projectRoot = __dirname;
const runtimePath = path.resolve(projectRoot, 'node_modules/@atlas/runtime');
const watchFolders = fs.existsSync(runtimePath) ? [runtimePath] : [];

const config = {
  watchFolders,
  resolver: {
    resolverMainFields: ['react-native', 'browser', 'main'],
    extraNodeModules: {
      '@babel/runtime': path.resolve(
        projectRoot,
        'node_modules/@babel/runtime',
      ),
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
      'expo-audio': path.resolve(projectRoot, 'node_modules/expo-audio'),
      three: path.resolve(projectRoot, 'node_modules/three'),
      '@react-three/fiber': path.resolve(
        projectRoot,
        'node_modules/@react-three/fiber',
      ),
    },
    blockList: [
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]react[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]react-native[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]three[\\/].*/,
      /node_modules[\\/]@mtg[\\/]runtime[\\/]node_modules[\\/]@react-three[\\/]fiber[\\/].*/,
    ],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@atlas/runtime' && platform) {
        const rnEntry = path.join(runtimePath, 'dist', 'index.rn.js');
        if (fs.existsSync(rnEntry)) {
          return { type: 'sourceFile', filePath: rnEntry };
        }
      }

      if (moduleName === 'three') {
        const threeCjs = path.join(
          projectRoot,
          'node_modules',
          'three',
          'build',
          'three.cjs',
        );
        if (fs.existsSync(threeCjs)) {
          return { type: 'sourceFile', filePath: threeCjs };
        }
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

const finalConfig = mergeConfig(getDefaultConfig(projectRoot), config);

module.exports = withStorybook(finalConfig, {
  enabled: process.env.STORYBOOK_ENABLED === 'true',
  configPath: path.resolve(projectRoot, '.rnstorybook'),
});
