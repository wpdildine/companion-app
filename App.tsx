/****
 * Root entry switch.
 * App runtime lives in src/app/App.tsx
 * Storybook can be enabled via STORYBOOK_ENABLED=true
 * @format
 */

import AppRoot from './src/app/App';

// Storybook is optional so we require lazily to avoid bundling when disabled
let StorybookUIRoot: any = null;

if (process.env.STORYBOOK_ENABLED === 'true') {
  StorybookUIRoot = require('./.rnstorybook').default;
}

export default process.env.STORYBOOK_ENABLED === 'true'
  ? StorybookUIRoot
  : AppRoot;
