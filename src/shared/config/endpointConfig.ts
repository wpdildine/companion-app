/**
 * Base URL for app hooks that call external endpoints.
 * Set ENDPOINT_BASE_URL in .env.local (or .env). .env.local is used at build time if present.
 *
 * Baked at build: babel.config.js uses babel-plugin-inline-dotenv to inline this value
 * when you run pnpm ios / pnpm android (or any Metro bundle). After changing .env.local,
 * run `pnpm start --reset-cache` and rebuild so the new value is baked.
 */

import { logInfo } from '../logging';
import { getSttOverride } from './sttDevOverride';

export {
  getSttOverride,
  setSttOverride,
  getSttOverrideStoreSnapshot,
  STT_DEV_OVERRIDE_MODULE_ID,
} from './sttDevOverride';
export type { SttProviderOverride } from './sttDevOverride';

const raw =
  typeof process !== 'undefined' && process.env != null
    ? process.env.ENDPOINT_BASE_URL
    : undefined;
const rawSttProvider =
  typeof process !== 'undefined' && process.env != null
    ? process.env.STT_PROVIDER
    : undefined;

/** Build-time STT mode: `local` (native only), `remote` (proxy only), `remote_with_local_fallback` (prefer remote; start-time fallback + next-listen local preference per orchestrator policy). */
export type SttProvider = 'local' | 'remote' | 'remote_with_local_fallback';

/** True when capture + proxy path should be used when remote prerequisites succeed (not `local`). */
export function isRemotePreferredStt(provider: SttProvider): boolean {
  return provider === 'remote' || provider === 'remote_with_local_fallback';
}

/** True when start-time fallback and next-listen local preference are enabled. */
export function isRemoteWithLocalFallbackStt(provider: SttProvider): boolean {
  return provider === 'remote_with_local_fallback';
}

/** Base URL for hook endpoints, or null if unset / "null" string. */
export function getEndpointBaseUrl(): string | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') {
    return null;
  }
  return raw.replace(/\/$/, '');
}

/** Speech-to-text provider mode from `STT_PROVIDER` (baked at build). Env only; use `resolveSttProvider` or `snapshotSttResolution` when override may apply. */
export function getSttProvider(): SttProvider {
  const raw = rawSttProvider?.trim().toLowerCase();
  if (raw === 'remote') return 'remote';
  if (raw === 'remote_with_local_fallback') return 'remote_with_local_fallback';
  return 'local';
}

/** Dev override (if set) then env. */
export function resolveSttProvider(): SttProvider {
  return snapshotSttResolution().provider;
}

/**
 * Single read of override store + env for orchestrator snapshot at listen boundaries.
 * Use for sessionSttProviderRef / sessionSttOverrideAppliedRef — not live reads at log time.
 */
export function snapshotSttResolution(): {
  provider: SttProvider;
  overrideApplied: boolean;
} {
  const o = getSttOverride();
  const envProvider = getSttProvider();
  if (o != null) {
    logInfo('Runtime', 'stt_seam snapshotSttResolution', {
      overrideProvider: o,
      envProvider,
      resolvedProvider: o,
      overrideApplied: true,
    });
    return { provider: o, overrideApplied: true };
  }
  logInfo('Runtime', 'stt_seam snapshotSttResolution', {
    overrideProvider: null,
    envProvider,
    resolvedProvider: envProvider,
    overrideApplied: false,
  });
  return { provider: envProvider, overrideApplied: false };
}
