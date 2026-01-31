#!/bin/bash

# Test script to verify models work with opencode
# Tests a representative sample from each provider

set -e

MODELS_FILE=".loopwork/models.json"
LOG_FILE=".loopwork/model-test-results.log"
TIMEOUT=30

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_model() {
  local model_id="$1"
  local display_name="$2"

  echo -n "Testing ${display_name} (${model_id})... "

  # Try to run a simple command with the model
  if timeout $TIMEOUT opencode run --model "$model_id" "echo 'Hello from model test'" &>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC}"
    echo "✓ $display_name ($model_id)" >> "$LOG_FILE"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}"
    echo "✗ $display_name ($model_id)" >> "$LOG_FILE"
    return 1
  fi
}

# Initialize log file
echo "Model Test Results - $(date)" > "$LOG_FILE"
echo "================================" >> "$LOG_FILE"
echo ""

# Sample models to test (one from each major provider)
SAMPLE_MODELS=(
  # Antigravity models
  "google/antigravity-gemini-3-flash:antigravity-gemini-3-flash"
  "google/antigravity-claude-sonnet-4-5:antigravity-claude-sonnet-4-5"

  # Google models
  "google/gemini-2.5-flash:gemini-2.5-flash"
  "google/gemini-2.5-pro:gemini-2.5-pro"

  # GitHub Copilot models
  "github-copilot/claude-sonnet-4.5:claude-sonnet-4.5"
  "github-copilot/gemini-3-flash-preview:gemini-3-flash-preview"

  # OpenRouter - Anthropic
  "openrouter/anthropic/claude-sonnet-4.5:anthropic"

  # OpenRouter - DeepSeek (free)
  "openrouter/deepseek/deepseek-v3-base:free:deepseek"

  # OpenRouter - Qwen (free)
  "openrouter/qwen/qwen3-coder:free:qwen"

  # Cerebras
  "cerebras/gpt-oss-120b:gpt-oss-120b"

  # Direct Anthropic
  "anthropic/claude-sonnet-4-5:claude-sonnet-4-5"

  # OpenCode native models
  "opencode/gemini-3-flash:gemini-3-flash"
  "opencode/claude-sonnet-4-5:claude-sonnet-4-5"

  # ZAI models
  "zai-coding-plan/glm-4.7:glm-4.7"
)

echo -e "${YELLOW}Starting model tests...${NC}"
echo "Testing ${#SAMPLE_MODELS[@]} models with ${TIMEOUT}s timeout each"
echo ""

PASSED=0
FAILED=0

for model_entry in "${SAMPLE_MODELS[@]}"; do
  IFS=':' read -r model_id display_name <<< "$model_entry"

  if test_model "$model_id" "$display_name"; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
done

echo ""
echo "================================"
echo -e "Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo "Full results saved to: $LOG_FILE"
echo ""

# Summary
echo "" >> "$LOG_FILE"
echo "================================" >> "$LOG_FILE"
echo "Summary: $PASSED passed, $FAILED failed" >> "$LOG_FILE"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tested models work correctly!${NC}"
  exit 0
else
  echo -e "${YELLOW}Some models failed. Check $LOG_FILE for details.${NC}"
  exit 1
fi
