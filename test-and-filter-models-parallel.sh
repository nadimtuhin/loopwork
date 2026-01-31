#!/bin/bash

# Parallel version - tests models concurrently for much faster execution
# Usage: ./test-and-filter-models-parallel.sh [--dry-run] [--jobs N]

set -e

MODELS_FILE=".loopwork/models.json"
BACKUP_FILE=".loopwork/models.json.backup"
FILTERED_FILE=".loopwork/models-working.json"
LOG_FILE=".loopwork/model-test-parallel-results.log"
TIMEOUT=60
DRY_RUN=false
JOBS=10  # Default: 10 concurrent tests

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --jobs)
      JOBS="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if models.json exists
if [[ ! -f "$MODELS_FILE" ]]; then
  echo -e "${RED}Error: $MODELS_FILE not found${NC}"
  exit 1
fi

# Test function (runs in subshell)
test_model() {
  local model_json="$1"
  local temp_dir="$2"

  local model_id=$(echo "$model_json" | jq -r '.modelId')
  local display_name=$(echo "$model_json" | jq -r '.displayName')
  local name=$(echo "$model_json" | jq -r '.name')

  # Test the model with a simple echo command
  if timeout $TIMEOUT opencode run --model "$model_id" "echo test" &>/dev/null; then
    # PASS - save to passed file
    echo "$model_json" >> "$temp_dir/passed.jsonl"
    echo "✓ $display_name ($model_id)" >> "$temp_dir/log.txt"
    echo -ne "${GREEN}✓${NC}"
  else
    # FAIL - save to failed file
    echo "✗ $display_name ($model_id)" >> "$temp_dir/log.txt"
    echo -ne "${RED}✗${NC}"
  fi
}

export -f test_model
export TIMEOUT GREEN RED NC

# Initialize
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  OpenCode Model Test (PARALLEL - ${JOBS} jobs)                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${YELLOW}🔍 DRY RUN MODE - Will not modify models.json${NC}"
  echo ""
fi

# Count total models
TOTAL_MODELS=$(jq '.models | length' "$MODELS_FILE")
echo "📊 Total models: $TOTAL_MODELS"
echo "⚡ Parallel jobs: $JOBS"
echo "⏱️  Timeout per model: ${TIMEOUT}s"
echo "⏳ Estimated time: ~$((TOTAL_MODELS * TIMEOUT / JOBS / 60)) minutes"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

touch "$TEMP_DIR/passed.jsonl"
touch "$TEMP_DIR/log.txt"

echo -e "${YELLOW}Testing...${NC}"
echo ""

# Extract all models to a temp file
jq -c '.models[]' "$MODELS_FILE" > "$TEMP_DIR/all_models.jsonl"

# Run parallel tests with GNU parallel or xargs
if command -v parallel &> /dev/null; then
  # Use GNU parallel (faster, better progress)
  cat "$TEMP_DIR/all_models.jsonl" | \
    parallel -j $JOBS --line-buffer --bar \
    test_model {} "$TEMP_DIR"
else
  # Fallback to bash loop with background jobs (available everywhere)
  echo "Note: Install GNU parallel for better progress indicators (brew install parallel)"
  echo ""

  COUNTER=0
  while IFS= read -r model_json; do
    # Wait if we've hit the job limit
    while [ $(jobs -r | wc -l) -ge $JOBS ]; do
      sleep 0.1
    done

    # Run test in background
    test_model "$model_json" "$TEMP_DIR" &

    ((COUNTER++))
    if ((COUNTER % 20 == 0)); then
      echo -ne "\r${BLUE}Progress: $COUNTER/$TOTAL_MODELS models tested...${NC}"
    fi
  done < "$TEMP_DIR/all_models.jsonl"

  # Wait for all background jobs to finish
  wait
  echo ""
fi

echo ""
echo ""

# Count results
PASSED=$(wc -l < "$TEMP_DIR/passed.jsonl" | tr -d ' ')
FAILED=$((TOTAL_MODELS - PASSED))

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Create final log file
{
  echo "Model Test Results (PARALLEL) - $(date)"
  echo "Testing ALL models in $MODELS_FILE with $JOBS parallel jobs"
  echo "================================"
  echo ""
  cat "$TEMP_DIR/log.txt"
  echo ""
  echo "================================"
  echo "Summary: $PASSED passed, $FAILED failed out of $TOTAL_MODELS total"
  echo "Success rate: $((PASSED * 100 / TOTAL_MODELS))%"
} > "$LOG_FILE"

# Create working models JSON
if [[ $PASSED -gt 0 ]]; then
  WORKING_MODELS=$(cat "$TEMP_DIR/passed.jsonl" | jq -s '.')
  echo "{\"models\": $WORKING_MODELS}" | jq '.' > "$FILTERED_FILE"

  echo -e "${GREEN}✓ Filtered models saved to: $FILTERED_FILE${NC}"
  echo ""

  # Show provider statistics
  echo "Working models by provider:"
  echo "$WORKING_MODELS" | jq -r '.[] | .name' | cut -d'/' -f1 | sort | uniq -c | sort -rn | head -20
  echo ""
else
  echo -e "${RED}No working models found!${NC}"
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${YELLOW}DRY RUN: Would have replaced $MODELS_FILE with filtered version${NC}"
  echo "Review $FILTERED_FILE and run without --dry-run to apply changes"
else
  # Offer to replace
  echo -e "${YELLOW}Replace $MODELS_FILE with only working models?${NC}"
  echo "  - Backup: $BACKUP_FILE"
  echo "  - Remove: $FAILED models"
  echo "  - Keep:   $PASSED models"
  echo ""
  read -p "Continue? (y/N): " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    cp "$MODELS_FILE" "$BACKUP_FILE"
    mv "$FILTERED_FILE" "$MODELS_FILE"

    echo -e "${GREEN}✓ Done!${NC}"
    echo "  Original: $TOTAL_MODELS → Working: $PASSED"
    echo "  Backup saved: $BACKUP_FILE"
  else
    echo "Cancelled. Filtered file: $FILTERED_FILE"
  fi
fi

echo ""
echo "Full results: $LOG_FILE"
