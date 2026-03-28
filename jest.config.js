module.exports = {
  preset: 'react-native',
  setupFiles: [
    './node_modules/react-native-gesture-handler/jestSetup.js',
  ],
  // Sibling RN build for `@atlas/runtime`; map `@babel/runtime` from the app so compiled
  // files under pack_runtime/dist resolve helpers when Jest loads the sibling path.
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    '^@atlas/runtime$': '<rootDir>/../pack_runtime/runtime-ts/dist/index.rn.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-native-community|@react-native-picker/picker|react-native-reanimated|react-native-gesture-handler)/',
    // Cycle 7: native better-sqlite3 under sibling pack_runtime must not be Babel-transformed
    // when integration tests require it for getContextRN parity mocks.
    '.*/pack_runtime/runtime-ts/node_modules/.*',
  ],
};
