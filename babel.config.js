const path = require('path');
const fs = require('fs');

// Prefer .env.local for build-time baking (e.g. ENDPOINT_BASE_URL); fallback to .env
const envPath = fs.existsSync(path.join(__dirname, '.env.local'))
  ? '.env.local'
  : '.env';

module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    [
      'babel-plugin-inline-dotenv',
      {
        path: envPath,
        unsafe: true, // bake the value into the bundle (no runtime process.env fallback)
      },
    ],
  ],
};
