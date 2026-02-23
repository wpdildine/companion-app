# On-device models (GGUF)

The app’s **ask path** uses the deterministic context provider (SQLite + router_map + spec) to build a context bundle; **no vector retrieval in-app**. The LLM is used only to format/summarize that context. Embeddings/vectors are **optional / offline tooling only** (e.g. pack build or lab); the app does not require an embed model for the default flow.

For the **chat (LLM)** model on device:

| Purpose | Filename | Notes |
|--------|----------|--------|
| Chat (LLM) | `llama3.2-3b-Q4_K_M.gguf` | Any small instruct GGUF; rename to this or change `CHAT_MODEL_FILENAME` in `App.tsx`. |
| Embeddings (optional) | `nomic-embed-text.gguf` | Only if you use embedding-based tooling; not required for the default deterministic ask path. |

## Where the app looks

The app reads these files from its **models** directory:

- **Android**: `getFilesDir() + "/models"` (e.g. `/data/data/com.companionapp/files/models/`)
- **iOS**: `Documents/models` inside the app container

Place the chat GGUF in that directory (and optionally the embed model if you use embedding-based tooling).

## How to get the path on device

1. Run the app and trigger RAG (e.g. ask a question). If the model file is missing, the error may show the full path.
2. Or in code: `NativeModules.RagPackReader.getAppModelsPath()` resolves with the directory path (JS can log it or show it in UI).

## Downloading the GGUF files

From the repo root, run:

```bash
./scripts/download-rag-models.sh
```

This downloads the chat (and optionally embed) models into `rag-models/` (or a path you pass). Copy the chat model into the app’s models directory (see below); embed only if you use an embedding-based path.

## Copying models onto the device

- **Android**: Push to internal storage then copy into app files (app-private dir is not writable via `adb push`). Example: push to `/sdcard/Download/`, then use a file manager or custom “Import from Download” in the app to copy into the app’s `files/models` folder. Or with root: `adb push nomic-embed-text.gguf /data/data/com.companionapp/files/models/`.
- **iOS**: Add files to the app container (e.g. via Xcode → Window → Devices and Simulators → select app → gear → Download Container, add files into `Documents/models`, then replace container), or use an in-app import if implemented.

## Changing the chat model filename

If you use a different chat GGUF (e.g. `my-model.gguf`), either:

- Rename it to `llama3.2-3b-Q4_K_M.gguf` in the models directory, or  
- In `App.tsx`, change the constant `CHAT_MODEL_FILENAME` to your filename.

## Optional: Ollama (network)

For development you can use Ollama instead of on-device GGUF. Set `ollamaHost`, `ollamaEmbedModel`, and `ollamaChatModel` in the RAG init params (see `src/rag/types.ts` and `src/rag/ask.ts`). By default the app uses on-device paths only.
