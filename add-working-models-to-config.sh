#!/bin/bash

# Add working models from models-working.json to loopwork.config.ts
# Generates ModelPresets configuration for OpenCode models

set -e

WORKING_MODELS_FILE=".loopwork/models-working.json"
CONFIG_FILE="loopwork.config.ts"
OUTPUT_FILE="loopwork-models-config.ts"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Generate Loopwork Config from Working Models             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if working models file exists
if [[ ! -f "$WORKING_MODELS_FILE" ]]; then
  echo -e "${YELLOW}⚠️  $WORKING_MODELS_FILE not found${NC}"
  echo "Run ./test-and-filter-models-parallel.sh first to generate it"
  exit 1
fi

# Count working models
MODEL_COUNT=$(jq '.models | length' "$WORKING_MODELS_FILE")
echo "📊 Found $MODEL_COUNT working models"
echo ""

if [[ $MODEL_COUNT -eq 0 ]]; then
  echo -e "${YELLOW}No working models found!${NC}"
  exit 1
fi

# Generate TypeScript config snippet
echo "Generating TypeScript configuration..."
echo ""

cat > "$OUTPUT_FILE" << 'EOF'
/**
 * Auto-generated Loopwork Configuration with Working OpenCode Models
 * Generated from tested and verified working models
 */

import {
  defineConfig,
  compose,
  withJSONBackend,
  withCli,
  ModelPresets,
  createModel,
} from "@loopwork-ai/loopwork";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),

  withCli({
    models: [
EOF

# Add each working model as a createModel entry
jq -r '.models[] |
  "      createModel({ name: \"\(.displayName)\", cli: \"opencode\", model: \"\(.modelId)\", timeout: 300 }),"' \
  "$WORKING_MODELS_FILE" >> "$OUTPUT_FILE"

# Remove trailing comma from last entry and close the array
sed -i.bak '$ s/,$//' "$OUTPUT_FILE" && rm "${OUTPUT_FILE}.bak"

cat >> "$OUTPUT_FILE" << 'EOF'

    ],
    fallbackModels: [
      // Add fallback models here if needed
    ],
    selectionStrategy: "round-robin",
  }),
)(defineConfig({
  maxIterations: 500,
  timeout: 600,
  autoConfirm: true,
  debug: true,
}));
EOF

echo -e "${GREEN}✓ Configuration generated: $OUTPUT_FILE${NC}"
echo ""

# Show preview
echo "Preview of generated config:"
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
head -30 "$OUTPUT_FILE"
echo "..."
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
echo ""

# Generate a simpler snippet for copy-paste
SNIPPET_FILE="working-models-snippet.ts"
cat > "$SNIPPET_FILE" << 'EOF'
// Working OpenCode models - copy this into your withCli({ models: [...] }) array
EOF

jq -r '.models[] |
  "createModel({ name: \"\(.displayName)\", cli: \"opencode\", model: \"\(.modelId)\", timeout: 300 }),"' \
  "$WORKING_MODELS_FILE" >> "$SNIPPET_FILE"

# Remove trailing comma
sed -i.bak '$ s/,$//' "$SNIPPET_FILE" && rm "${SNIPPET_FILE}.bak"

echo -e "${GREEN}✓ Copy-paste snippet generated: $SNIPPET_FILE${NC}"
echo ""

# Offer to show the models list
echo "Working models:"
jq -r '.models[] | "  • \(.displayName) (\(.modelId))"' "$WORKING_MODELS_FILE"
echo ""

# Instructions
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the generated config: $OUTPUT_FILE"
echo "2. Copy relevant sections to your $CONFIG_FILE"
echo "3. Or use the full generated config: mv $OUTPUT_FILE $CONFIG_FILE"
echo ""
echo "Quick snippet for copy-paste: $SNIPPET_FILE"
