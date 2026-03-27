/**
 * Runtime dev override for STT provider modes. No routing logic; orchestrator owns policy.
 * Import `setSttOverride` / `getSttOverride` from this file or from `endpointConfig` (re-export) — same module instance.
 *
 * Type mirrors `SttProvider` in endpointConfig.ts (no import to avoid circular dependency).
 */

import { logInfo } from '../logging';

export type SttProviderOverride = 'local' | 'remote' | 'remote_with_local_fallback';

/** Default STT when no dev override is set; env resolution uses this as fallback (see `getSttProvider`). */
export const DEFAULT_STT_PROVIDER: SttProviderOverride = 'local';

/** Stable id for log correlation (proves single bundle path). */
export const STT_DEV_OVERRIDE_MODULE_ID = 'shared/config/sttDevOverride';

let overrideProvider: SttProviderOverride | null = null;

/** Read-only view of the module store for debugging (no persistence). */
export function getSttOverrideStoreSnapshot(): {
  provider: SttProviderOverride | null;
  moduleId: string;
} {
  return {
    provider: overrideProvider,
    moduleId: STT_DEV_OVERRIDE_MODULE_ID,
  };
}

export function getSttOverride(): SttProviderOverride | null {
  const v = overrideProvider;
  logInfo('Runtime', 'stt_seam getSttOverride', {
    returned: v,
    moduleId: STT_DEV_OVERRIDE_MODULE_ID,
  });
  return v;
}

export function setSttOverride(provider: SttProviderOverride | null): void {
  overrideProvider = provider;
  logInfo('Runtime', 'stt_seam setSttOverride', {
    written: provider,
    moduleId: STT_DEV_OVERRIDE_MODULE_ID,
  });
}
