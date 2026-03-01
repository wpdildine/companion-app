# Native Plugin Contract (New Arch / Bridgeless)

This document defines the **standardized interface** for native plugins in this repo. Plugins remain independent; the **contract** is shared so logging, errors, and events can be normalized and unified in JS.

## Five rules (every plugin must follow)

1. **Never crash the JS thread** — run heavy work on native background threads; never throw from a sync bridge call in a way that can take down JS.
2. **Never block the JS thread** — async native methods must return immediately (e.g. dispatch to a queue) and resolve/reject later.
3. **Reject with structured errors** — use a stable `code`, human-readable `message`, and optional `details` object.
4. **Emit structured events** — use a consistent event payload shape (e.g. `type`, `message`, `data`) for progress, warnings, and completion.
5. **Expose debug info** — provide a method (e.g. `getDebugInfo()`) that returns a string or object useful for diagnostics (e.g. module loaded, model path, version).

## Three lanes

### 1) Developer logs — "always available" debugging

Fast, noisy logs for debugging. No JS round-trip; they show in Metro and device logs.

| Platform    | API                    | Convention                                                                 |
| ----------- | ---------------------- | -------------------------------------------------------------------------- |
| **iOS**     | `RCTLogInfo` / `RCTLogWarn` / `RCTLogError` | Prefix: `[ModuleName]`. When logging an error path include code: `[ModuleName][E_CODE] message`. |
| **Android** | `Log.d` / `Log.w` / `Log.e`       | Tag: module name (e.g. `"PiperTts"`). Message can include `[E_CODE]` for errors.   |
| **C++**     | `__android_log_print` / `os_log`  | Same prefix or tag as above.                                               |

Example (iOS): `RCTLogError(@"[PiperTts][E_NO_MODEL] model or config missing");`  
Example (Android): `Log.e(TAG, "[E_NO_MODEL] model or config missing");`

### 2) Structured errors — reject promises with codes + metadata

Every async native method returns a **Promise**. On failure, reject with:

- **code** (string): Stable identifier for programmatic handling (e.g. `E_NO_MODEL`, `E_ORT`).
- **message** (string): Human-readable description.
- **details** (optional object): Extra context (e.g. `{ nativeStack, ... }`).

**JS side:** Each plugin defines a typed error code union (e.g. `PiperErrorCode`) and normalizes rejections into the shared `PluginError<T>` shape so the app can handle them consistently.

### 3) Runtime events — progress / warnings / "done"

For progress, non-fatal warnings, and completion signals. Each plugin exposes its own subscription API (callback or event name) but uses a **consistent payload shape**:

- `type` (string): Event kind (e.g. `speak_start`, `speak_end`, `warning`).
- `message` (string, optional): Short description.
- `data` (object, optional): Extra payload.

The app’s **PluginDiagnostics** layer subscribes to all plugins, normalizes these events, buffers the last N, and forwards to console or Sentry.

## Shared TypeScript types

- **PluginError\<T\>**: `{ code: T; message: string; details?: Record<string, unknown> }`
- **PluginEventPayload**: `{ type: string; message?: string; data?: Record<string, unknown> }`
- **NormalizedDiagnosticEvent**: `{ timestamp: number; source: string; type: string; message?: string; data?: Record<string, unknown> }`

Defined in `src/types/plugin-contract.ts`; plugins and the app import from there.

## Plugin checklist (for new or updated plugins)

- [ ] **Logging**: iOS uses `[ModuleName]` and `[E_CODE]` in log messages; Android uses a constant tag and optional `[E_CODE]` in the message.
- [ ] **Errors**: All async methods reject with `(code, message, optionalDetails)`; JS exposes a typed error code union and normalizes to `PluginError<Code>`.
- [ ] **Events**: Plugin exposes a way to subscribe (e.g. `subscribe(callback)` or event emitter); payloads use the shared event shape.
- [ ] **Debug**: `getDebugInfo()` or equivalent returns a string or object useful for support/debugging.
- [ ] **No crash/block**: Heavy work and I/O run off the JS thread; no synchronous blocking of the bridge.

## JS unification layer (PluginDiagnostics)

The app provides a single JS module (`src/native/PluginDiagnostics.ts`) that:

- Subscribes to events from all plugins.
- Normalizes them to a common shape (timestamp, source, type, message, data).
- Stores the last N events in a ring buffer.
- Forwards to console (and optionally Sentry).

Plugins do not depend on each other; PluginDiagnostics is the only place that imports every plugin’s subscription API. When you add a new plugin, add one subscription in PluginDiagnostics.
