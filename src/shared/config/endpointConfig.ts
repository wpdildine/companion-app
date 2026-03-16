/**
 * Base URL for app hooks that call external endpoints.
 * Set ENDPOINT_BASE_URL in .env.local (or .env). .env.local is used at build time if present.
 *
 * Baked at build: babel.config.js uses babel-plugin-inline-dotenv to inline this value
 * when you run pnpm ios / pnpm android (or any Metro bundle). After changing .env.local,
 * run `pnpm start --reset-cache` and rebuild so the new value is baked.
 */

const raw =
  typeof process !== 'undefined' && process.env != null
    ? process.env.ENDPOINT_BASE_URL
    : undefined;
const rawSttProvider =
  typeof process !== 'undefined' && process.env != null
    ? process.env.STT_PROVIDER
    : undefined;

export type SttProvider = 'local' | 'remote';

/** Base URL for hook endpoints, or null if unset / "null" string. */
export function getEndpointBaseUrl(): string | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') {
    return null;
  }
  return raw.replace(/\/$/, '');
}

/** Speech-to-text provider mode: `local` keeps native speech recognition, `remote` uploads captured audio to the proxy. */
export function getSttProvider(): SttProvider {
  return rawSttProvider === 'remote' ? 'remote' : 'local';
}
