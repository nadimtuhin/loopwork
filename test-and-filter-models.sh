#!/bin/bash

# Test all models in models.json and create a filtered version with only working models
# Usage: ./test-and-filter-models.sh [--dry-run]

set -e

MODELS_FILE=".loopwork/models.json"
BACKUP_FILE=".loopwork/models.json.backup"
FILTERED_FILE=".loopwork/models-working.json"
LOG_FILE=".loopwork/model-test-all-results.log"
TIMEOUT=30
DRY_RUN=false

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE - Will not modify models.json"
  echo ""
fi

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if models.json exists
if [[ ! -f "$MODELS_FILE" ]]; then
  echo -e "${RED}Error: $MODELS_FILE not found${NC}"
  exit 1
fi

# Test function
test_model() {
  local model_id="$1"
  local display_name="$2"

  # Try to run a simple command with the model
  if timeout $TIMEOUT opencode run --model "$model_id" "echo test" &>/dev/null; then
    return 0  # PASS
  else
    return 1  # FAIL
  fi
}

# Initialize
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  OpenCode Model Compatibility Test & Filter               ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Count total models
TOTAL_MODELS=$(jq '.models | length' "$MODELS_FILE")
echo "📊 Total models to test: $TOTAL_MODELS"
echo "⏱️  Timeout per model: ${TIMEOUT}s"
echo "📝 Results will be logged to: $LOG_FILE"
echo ""

# Initialize log file
echo "Model Test Results - $(date)" > "$LOG_FILE"
echo "Testing ALL models in $MODELS_FILE" >> "$LOG_FILE"
echo "================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Read all models
MODELS=$(jq -c '.models[]' "$MODELS_FILE")

PASSED=0
FAILED=0
WORKING_MODELS="[]"

echo -e "${YELLOW}Starting tests...${NC}"
echo ""

# Test each model
while IFS= read -r model; do
  model_id=$(echo "$model" | jq -r '.modelId')
  display_name=$(echo "$model" | jq -r '.displayName')
  name=$(echo "$model" | jq -r '.name')

  # Progress indicator
  CURRENT=$((PASSED + FAILED + 1))
  PERCENT=$((CURRENT * 100 / TOTAL_MODELS))
  echo -ne "${BLUE}[$CURRENT/$TOTAL_MODELS - ${PERCENT}%]${NC} Testing ${display_name}... "

  if test_model "$model_id" "$display_name"; then
    echo -e "${GREEN}✓ PASS${NC}"
    echo "✓ $display_name ($model_id)" >> "$LOG_FILE"
    ((PASSED++))

    # Add to working models list
    WORKING_MODELS=$(echo "$WORKING_MODELS" | jq --argjson model "$model" '. + [$model]')
  else
    echo -e "${RED}✗ FAIL${NC}"
    echo "✗ $display_name ($model_id)" >> "$LOG_FILE"
    ((FAILED++))
  fi
done <<< "$MODELS"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Write summary to log
echo "" >> "$LOG_FILE"
echo "================================" >> "$LOG_FILE"
echo "Summary: $PASSED passed, $FAILED failed out of $TOTAL_MODELS total" >> "$LOG_FILE"
echo "Success rate: $((PASSED * 100 / TOTAL_MODELS))%" >> "$LOG_FILE"

# Create filtered JSON
echo "📄 Creating filtered models file..."
echo "{\"models\": $WORKING_MODELS}" | jq '.' > "$FILTERED_FILE"

echo -e "${GREEN}✓ Filtered models saved to: $FILTERED_FILE${NC}"
echo ""

# Show sample of working models
echo "Working models by provider:"
echo "$WORKING_MODELS" | jq -r '.[] | .name' | cut -d'/' -f1 | sort | uniq -c | sort -rn

echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${YELLOW}DRY RUN: Would have replaced $MODELS_FILE with filtered version${NC}"
  echo "Review $FILTERED_FILE and run without --dry-run to apply changes"
else
  # Offer to replace
  echo -e "${YELLOW}Do you want to replace $MODELS_FILE with only working models?${NC}"
  echo "This will:"
  echo "  1. Backup current file to $BACKUP_FILE"
  echo "  2. Replace $MODELS_FILE with $FILTERED_FILE"
  echo "  3. Remove $FAILED models, keep $PASSED models"
  echo ""
  read -p "Continue? (y/N): " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    cp "$MODELS_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"

    mv "$FILTERED_FILE" "$MODELS_FILE"
    echo -e "${GREEN}✓ Models file updated!${NC}"
    echo ""
    echo "Summary:"
    echo "  - Original: $TOTAL_MODELS models"
    echo "  - Removed:  $FAILED non-working models"
    echo "  - Kept:     $PASSED working models"
    echo ""
    echo "You can restore the original with: cp $BACKUP_FILE $MODELS_FILE"
  else
    echo "Cancelled. Filtered file available at: $FILTERED_FILE"
  fi
fi

echo ""
echo "Full test results: $LOG_FILE"

exit 0
