#!/usr/bin/env bash
# Cross-model audit helper. Sends a prompt to GLM (Anthropic-compatible
# endpoint) and prints the response.
#
# Key resolution (first match wins):
#   1. $GLM_API_KEY env (preferred — set by caller)
#   2. grep'd from ~/.zshrc (fallback for non-interactive shells that
#      skip rc files; matches `export GLM_API_KEY='...'`)
#
# Usage: scripts/audit-glm.sh <prompt-file>
#
# Why this exists: docs/ralph/README.md §6 requires independent audit by a
# different model. GLM is the designated auditor. We treat GLM as a black box
# and never log the API key.
set -euo pipefail
PROMPT_FILE="${1:?usage: $0 <prompt-file>}"
API_BASE="https://open.bigmodel.cn/api/anthropic"
MODEL="${GLM_MODEL:-glm-5.2}"

if [[ -z "${GLM_API_KEY:-}" ]]; then
  GLM_API_KEY=$(grep -oE "GLM_API_KEY=['\"][^'\"]+['\"]" ~/.zshrc 2>/dev/null | head -1 | sed -E "s/GLM_API_KEY=['\"]//; s/['\"]$//" || true)
fi
: "${GLM_API_KEY:?GLM_API_KEY not set in env or ~/.zshrc}"

PROMPT=$(cat "$PROMPT_FILE")

curl -sS "$API_BASE/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GLM_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "$(jq -n --arg model "$MODEL" --arg prompt "$PROMPT" '{
    model: $model,
    max_tokens: 8192,
    messages: [{role: "user", content: $prompt}]
  }')" | jq -r '.content[]?.text // .'
