#!/usr/bin/env bash
# Download GGUF models for on-device RAG into a local directory. You then copy these into the app's
# models directory (see docs/RAG_MODELS.md). Run from repo root: ./scripts/download-rag-models.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:-$REPO_ROOT/rag-models}"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# Embed model: nomic-embed-text (768 dim, matches pack index). Save as nomic-embed-text.gguf.
NOMIC_URL="https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf"
if [[ ! -f "nomic-embed-text.gguf" ]]; then
  echo "Downloading embed model (nomic-embed-text)..."
  curl -L -o nomic-embed-text.gguf "$NOMIC_URL"
else
  echo "Embed model already present: nomic-embed-text.gguf"
fi

# Chat model: small instruct model. Example: Llama 3.2 3B Q4_K_M (rename to expected filename).
# You can replace this URL with another small GGUF instruct model.
CHAT_URL="https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
if [[ ! -f "llama3.2-3b-Q4_K_M.gguf" ]]; then
  echo "Downloading chat model (Llama 3.2 3B Q4_K_M)..."
  curl -L -o llama3.2-3b-Q4_K_M.gguf "$CHAT_URL"
else
  echo "Chat model already present: llama3.2-3b-Q4_K_M.gguf"
fi

echo ""
echo "Models are in: $OUT_DIR"
echo "Copy both GGUF files into the app's 'models' directory (see docs/RAG_MODELS.md)."
