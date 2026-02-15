# On-device RAG models (GGUF)

The RAG feature uses two GGUF models on device:

| Purpose | Filename | Notes |
|--------|----------|--------|
| Embeddings | `nomic-embed-text.gguf` | Must match pack index (768 dim). Use [nomic-embed-text](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF) (e.g. Q4_0 or similar). |
| Chat | `llama3.2-3b-Q4_K_M.gguf` | Any small instruct GGUF; rename to this or change `CHAT_MODEL_FILENAME` in `App.tsx`. |

## Where the app looks

The app reads these files from its **models** directory:

- **Android**: `getFilesDir() + "/models"` (e.g. `/data/data/com.companionapp/files/models/`)
- **iOS**: `Documents/models` inside the app container

You must place the two GGUF files in that directory with the exact names above.

## How to get the path on device

1. Run the app and trigger RAG (e.g. ask a question). If the model file is missing, the error may show the full path.
2. Or in code: `NativeModules.RagPackReader.getAppModelsPath()` resolves with the directory path (JS can log it or show it in UI).

## Downloading the GGUF files

From the repo root, run:

```bash
./scripts/download-rag-models.sh
```

This downloads the embed and chat models into `rag-models/` (or a path you pass). Then copy the contents of that folder into the app’s models directory (see below).

## Copying models onto the device

- **Android**: Push to internal storage then copy into app files (app-private dir is not writable via `adb push`). Example: push to `/sdcard/Download/`, then use a file manager or custom “Import from Download” in the app to copy into the app’s `files/models` folder. Or with root: `adb push nomic-embed-text.gguf /data/data/com.companionapp/files/models/`.
- **iOS**: Add files to the app container (e.g. via Xcode → Window → Devices and Simulators → select app → gear → Download Container, add files into `Documents/models`, then replace container), or use an in-app import if implemented.

## Changing the chat model filename

If you use a different chat GGUF (e.g. `my-model.gguf`), either:

- Rename it to `llama3.2-3b-Q4_K_M.gguf` in the models directory, or  
- In `App.tsx`, change the constant `CHAT_MODEL_FILENAME` to your filename.

## Optional: Ollama (network)

For development you can use Ollama instead of on-device GGUF. Set `ollamaHost`, `ollamaEmbedModel`, and `ollamaChatModel` in the RAG init params (see `src/rag/types.ts` and `src/rag/ask.ts`). By default the app uses on-device paths only.
