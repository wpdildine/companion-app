/**
 * Legacy name for the agent experience composition root.
 * The actual implementation is AgentSurface; this file exists for compatibility.
 * Prefer importing AgentSurface. See docs/APP_ARCHITECTURE.md.
 */
import { logWarn } from '../shared/logging';

logWarn('VoiceScreen', 'DEPRECATED legacy entrypoint invoked, forwarding to AgentSurface');

export { default } from './AgentSurface';
