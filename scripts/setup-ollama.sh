#!/usr/bin/env bash
# setup-ollama.sh — Pull qwen2.5:7b into the Ollama Docker container
# Usage: docker-compose up ollama -d && bash scripts/setup-ollama.sh

set -euo pipefail

OLLAMA_URL="http://localhost:11434"
MODEL="qwen2.5:7b"
MAX_ATTEMPTS=30
SLEEP_SECONDS=2

echo "Waiting for Ollama to be ready at ${OLLAMA_URL} ..."

for i in $(seq 1 $MAX_ATTEMPTS); do
  if curl -sf "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
    echo "Ollama is up (attempt ${i}/${MAX_ATTEMPTS})."
    break
  fi
  if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
    echo "ERROR: Ollama did not respond after ${MAX_ATTEMPTS} attempts."
    echo "Is 'docker-compose up ollama -d' running?"
    exit 1
  fi
  sleep $SLEEP_SECONDS
done

CONTAINER=$(docker ps --filter name=ollama --format '{{.Names}}' | head -1)

if [ -z "$CONTAINER" ]; then
  echo "ERROR: No running Ollama container found."
  echo "Run: docker-compose up ollama -d"
  exit 1
fi

echo "Pulling ${MODEL} into container '${CONTAINER}' ..."
docker exec -it "$CONTAINER" ollama pull "$MODEL"

echo ""
echo "============================================"
echo " Ollama ready. ${MODEL} loaded."
echo " Set USE_LLM=true and LLM_PROVIDER=ollama to activate."
echo "============================================"
