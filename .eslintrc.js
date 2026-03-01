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
                name: '@mtg/runtime/node',
                message:
                  'App must not import Node entrypoint. Use @mtg/runtime (RN entry) only. Parity/tests use @mtg/runtime/node.',
              },
              {
                name: '@mtg/runtime/node/*',
                message: 'App must not import Node-only subpaths. Use @mtg/runtime only.',
              },
            ],
          },
        ],
      },
    },
  ],
};
