#!/bin/bash

# Filter models.json to only include models available in opencode
# Much faster than testing each model - just checks against opencode models output

set -e

MODELS_FILE=".loopwork/models.json"
BACKUP_FILE=".loopwork/models.json.backup"
FILTERED_FILE=".loopwork/models-available.json"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Filter Models by OpenCode Availability                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if models.json exists
if [[ ! -f "$MODELS_FILE" ]]; then
  echo -e "${YELLOW}⚠️  $MODELS_FILE not found${NC}"
  exit 1
fi

echo "📋 Getting available models from OpenCode..."
# Get list of available models from opencode
AVAILABLE_MODELS=$(opencode models 2>/dev/null)

if [[ -z "$AVAILABLE_MODELS" ]]; then
  echo -e "${YELLOW}⚠️  Could not get model list from opencode${NC}"
  exit 1
fi

# Save to temp file for processing
echo "$AVAILABLE_MODELS" > /tmp/opencode-available-models.txt

TOTAL=$(jq '.models | length' "$MODELS_FILE")
echo "📊 Total models in JSON: $TOTAL"
echo ""

echo "Filtering..."
MATCHING_MODELS="[]"
MATCHED=0
NOT_FOUND=0

# Process each model
while IFS= read -r model; do
  model_id=$(echo "$model" | jq -r '.modelId')
  name=$(echo "$model" | jq -r '.name')

  # Check if model is in available list
  if grep -q "^${model_id}\$" /tmp/opencode-available-models.txt; then
    MATCHING_MODELS=$(echo "$MATCHING_MODELS" | jq --argjson model "$model" '. + [$model]')
    ((MATCHED++))
    echo -ne "${GREEN}✓${NC}"
  else
    ((NOT_FOUND++))
    echo -ne "${YELLOW}·${NC}"
  fi

  # Progress indicator
  if (((MATCHED + NOT_FOUND) % 50 == 0)); then
    echo " $((MATCHED + NOT_FOUND))/$TOTAL"
  fi
done < <(jq -c '.models[]' "$MODELS_FILE")

echo ""
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "Results: ${GREEN}${MATCHED} available${NC}, ${YELLOW}${NOT_FOUND} not found${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Create filtered JSON
echo "{\"models\": $MATCHING_MODELS}" | jq '.' > "$FILTERED_FILE"
echo -e "${GREEN}✓ Filtered models saved to: $FILTERED_FILE${NC}"
echo ""

# Show provider stats
echo "Available models by provider:"
echo "$MATCHING_MODELS" | jq -r '.[] | .name' | cut -d'/' -f1 | sort | uniq -c | sort -rn

echo ""
echo -e "${YELLOW}Replace $MODELS_FILE with filtered version?${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  cp "$MODELS_FILE" "$BACKUP_FILE"
  mv "$FILTERED_FILE" "$MODELS_FILE"

  echo -e "${GREEN}✓ Done!${NC}"
  echo "  Original: $TOTAL → Available: $MATCHED"
  echo "  Backup: $BACKUP_FILE"
else
  echo "Cancelled. Filtered file: $FILTERED_FILE"
fi

# Clean up
rm -f /tmp/opencode-available-models.txt
