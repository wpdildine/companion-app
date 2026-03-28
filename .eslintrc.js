module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['node_modules/', '**/node_modules/'],
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx', 'App.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@atlas/runtime/node',
                message:
                  'App must not import Node entrypoint. Use @atlas/runtime (RN entry) only. Parity/tests use @atlas/runtime/node.',
              },
              {
                name: '@atlas/runtime/node/*',
                message:
                  'App must not import Node-only subpaths. Use @atlas/runtime only.',
              },
            ],
          },
        ],
      },
    },
  ],
};
