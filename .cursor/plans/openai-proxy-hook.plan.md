# Thin OpenAI Proxy Hook (Transport-Only)

## Goal

Implement a **provider seam** for the backend proxy: one hook that owns only URL resolution, request lifecycle, and normalized results for `/api/stt` and `/api/respond`. The hook does **not** own RAG/context generation, transcript semantics, response surface state, or app orchestration.

---

## Endpoint contracts (explicit)

All proxy communication must use these **public** types. The app must not parse raw OpenAI payloads; the hook normalizes proxy output into these shapes.

### /api/stt

- **Request type: `SttRequest`**
  - `audioBase64: string`
  - `mimeType?: string`
  - `filename?: string`
  - `language?: string`

- **Normalized result type: `SttResult`**
  - `text: string` — **required**. If the proxy returns no transcript text, the hook must treat that as an error (set `lastError` and throw), not return an empty or optional text.
  - `raw?: unknown` — **Optional and intended only for debugging/inspection during early integration.** Callers must not depend on `raw`; the transport seam must not leak proxy internals. Plan to remove or keep behind a debug flag once stable.

### /api/respond

- **Request type: `RespondRequest`**
  - `prompt: string`
  - `system?: string`

- **Normalized result type: `RespondResult`**
  - `text: string` — **required**. If the proxy returns no assistant text, the hook must treat that as an error, not push an ambiguous maybe-value downstream.
  - `model?: string`
  - `usage?`: **typed shape only** — `{ inputTokens?: number; outputTokens?: number; totalTokens?: number }`. Not a loose `object`; use this explicit type so downstream consumers stay clean and avoid object pollution.
  - `raw?: unknown` — **Optional and intended only for debugging/inspection during early integration.** Same as STT; no caller dependency on `raw`.

The hook’s job is to normalize raw proxy output into these app-friendly types. Missing `text` in either path is an error condition, not a valid result.

---

## Env handling (explicit)

- **Build request URLs from `ENDPOINT_BASE_URL`** (via the existing helper; see below). Do not hardcode host or paths elsewhere.
- **Fail fast with a readable error** if the env is missing, empty, or `"null"`: e.g. “OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)”. Do not attempt a request with an undefined base.
- **Do not scatter direct env reads outside the provider boundary.** All use of `ENDPOINT_BASE_URL` for this hook must go through the single config helper (e.g. `getEndpointBaseUrl()` in [src/app/endpointConfig.ts](src/app/endpointConfig.ts)). That keeps local-vs-deployed proxy switching in one place.

---

## Non-goal: online/offline policy

The hook **does not** own online/offline mode policy beyond surfacing network/proxy errors. It should not implement `isOnlineMode`, provider availability checks, or fallback behavior. Offline mode is a broader app behavior decision; the hook only reports failures (e.g. network error, proxy unreachable) via `lastError` or thrown errors. No hidden offline logic inside the provider seam.

---

## Current state

- **[src/app/endpointConfig.ts](src/app/endpointConfig.ts)** exposes `getEndpointBaseUrl()` (reads `ENDPOINT_BASE_URL`; baked at build via babel-plugin-inline-dotenv). Reuse it for URL construction; no new env helper needed.
- **RAG flow** today: [src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts) submit path calls `ragAsk(question, ...)` ([src/rag/ask.ts](src/rag/ask.ts)). The proxy hook is a separate path; orchestration will own “run local RAG/context then call respond.”
- No existing `/api/stt` or `/api/respond` usage. No `src/app/providers/` folder yet.

---

## Target layout

```
src/app/providers/openAI/
  openAIProxyTypes.ts   # SttRequest, SttResult, RespondRequest, RespondResult, normalized error type
  useOpenAIProxy.ts     # Hook: transcribeAudio, respond, isTranscribing, isResponding, lastError
  useOpenAIProxy.test.ts
```

---

## 1. Types — `openAIProxyTypes.ts`

- Export **SttRequest**, **SttResult**, **RespondRequest**, **RespondResult** exactly as in the endpoint contracts above.
- **RespondResult.text** and **SttResult.text** are required; missing text is an error, not a valid result.
- **raw?** on both result types: optional and intended only for debugging/inspection during early integration; document in code and in this plan. Callers must not depend on `raw`.
- **RespondResult.usage**: use the explicit typed shape `{ inputTokens?: number; outputTokens?: number; totalTokens?: number }`, not `usage?: object`.
- Normalized **error** type (e.g. `OpenAIProxyError` or `{ message: string; code?: string }`) for: base URL missing, network failure, non-200, malformed JSON, missing text. No raw OpenAI payloads in errors.

---

## 2. Hook — `useOpenAIProxy.ts`

- **URLs**: Build from `getEndpointBaseUrl()` only:
  - `${base}/api/stt`
  - `${base}/api/respond`
  - If base is `null` or empty → fail fast with readable error (e.g. “OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)”).
- **Public API** (and only this):
  - `isTranscribing: boolean`
  - `isResponding: boolean`
  - `lastError: string | null` (or normalized error type; clear on new request or success)
  - `transcribeAudio(input: SttRequest): Promise<SttResult>`
  - `respond(input: RespondRequest): Promise<RespondResult>`
- **Behavior**: POST JSON; normalize responses to `SttResult` / `RespondResult`. **Error pattern:** on any failure (base URL missing, network, non-OK, malformed JSON, missing text), the hook must **throw** a normalized error and **also** set `lastError`. Do not return a result with empty/optional text; treat missing text as error (set `lastError`, then throw). This keeps the hook ergonomic for orchestration (callers can try/catch or check `lastError`) and avoids “sometimes result, sometimes error object” unions. The hook **does not** allow the client to choose the OpenAI model; the Worker hardcodes/whitelists model choice, so the hook does not expose model selection in its public API. Optional: AbortController for cancellation.
- **No**: RAG, context building, transcript parsing, UI state, orchestration, online/offline policy, or model selection.

---

## 3. Error handling

- **Single pattern:** on every failure, the hook **throws** a normalized error and **also** updates `lastError`. No “return error object” or union types; callers get a consistent throw + `lastError` for inspection.
- Base URL null/empty → readable message citing `ENDPOINT_BASE_URL`.
- Network / !res.ok / malformed JSON / missing text → normalized error only; no leaking of raw proxy/OpenAI bodies.

---

## 4. Unit test expectations (required)

Tests must be explicit and cover failure paths, not only the happy path:

1. **URL construction from ENDPOINT_BASE_URL** — With a mocked or controlled base URL, assert the hook calls exactly `${base}/api/stt` and `${base}/api/respond` (no trailing slash on base, correct path).
2. **Env-missing failure case** — When `getEndpointBaseUrl()` returns `null` or empty, assert the hook fails fast with a readable error and **that no `fetch` call is attempted**. This guards the “fail fast” requirement and prevents stray requests with an undefined base.
3. **Non-OK proxy response handling** — Mock `fetch` returning 4xx or 5xx; assert normalized error (e.g. `lastError` set or thrown), no raw response leaked.
4. **Missing text handling for both STT and respond** — Mock 200 responses with valid JSON but missing or empty `text` (or equivalent field the proxy uses); assert the hook treats as error (normalized message like “STT transcription returned no text” / “Respond request returned no assistant text”), does not return a result with empty text.
5. **Normalization of usage/model for respond** — Mock 200 with proxy payload containing model and usage (e.g. `inputTokens`, `outputTokens`, `totalTokens`); assert `RespondResult` has `text` (required), and when present, `model` and `usage` are normalized as per `RespondResult` (no raw payload dependency).

These five categories are mandatory so the hook is not “works in happy path only.”

---

## 5. Integration (out of scope for “build the hook” — Phase 2/3)

- **Phase 2**: Wire `/api/respond` into a keyboard path to verify end-to-end without RAG.
- **Phase 3**: Orchestration: RAG/context generation then `respond(...)`; voice path add `transcribeAudio` then same flow.

---

## 6. Architecture alignment

- [ARCHITECTURE.md](docs/ARCHITECTURE.md): Hooks call services; screens don’t do IO. This hook is the service for the proxy; orchestration owns RAG and UI state.
- Place under `src/app/providers/openAI/` as a backend/provider seam.

---

## Summary

| Item | Requirement |
|------|--------------|
| **Public types** | SttRequest, SttResult, RespondRequest, RespondResult (exact shapes above); `text` required on both results; `usage` is typed shape only, not `object` |
| **raw?** | Optional; intended only for debugging/inspection during early integration; no caller dependency |
| **Error pattern** | Throw normalized errors and also set `lastError`; no “return error object” or result/error unions |
| **Model choice** | Hook does not expose model selection; Worker owns model hardcode/whitelist |
| **Env** | URLs from ENDPOINT_BASE_URL only; fail fast if missing; no scattered env reads outside provider |
| **Non-goal** | No online/offline policy in the hook beyond surfacing errors |
| **Tests** | URL construction; env-missing (fail fast + **no fetch attempted**); non-OK response; missing text (STT + respond); usage/model normalization for respond |

No dependency version changes. Hook stays thin; orchestration owns when to call and what to pass (including RAG-built prompt).
