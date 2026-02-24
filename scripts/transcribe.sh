#!/bin/bash

# Transcribe audio file using whisper.cpp
# Usage: ./transcribe.sh <audio_file_path>

set -e

AUDIO_FILE="$1"

if [ -z "$AUDIO_FILE" ]; then
  echo "Error: No audio file provided" >&2
  echo "Usage: $0 <audio_file_path>" >&2
  exit 1
fi

if [ ! -f "$AUDIO_FILE" ]; then
  echo "Error: Audio file not found: $AUDIO_FILE" >&2
  exit 1
fi

WHISPER_DIR="$HOME/Developer/whisper.cpp"
WHISPER_PATH="$WHISPER_DIR/build/bin/whisper-cli"
MODEL_PATH="$WHISPER_DIR/models/ggml-base.bin"

if [ ! -f "$WHISPER_PATH" ]; then
  echo "Error: whisper-cli not found at $WHISPER_PATH" >&2
  exit 1
fi

if [ ! -f "$MODEL_PATH" ]; then
  echo "Error: Model file not found at $MODEL_PATH" >&2
  exit 1
fi

exec "$WHISPER_PATH" -np -nt -l zh -m "$MODEL_PATH" -f "$AUDIO_FILE"
