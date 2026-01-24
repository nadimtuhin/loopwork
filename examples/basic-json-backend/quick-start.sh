#!/bin/bash
# Quick Start Script for Basic JSON Backend Example

set -e

echo "🚀 Loopwork Basic Example - Quick Start"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "loopwork.config.js" ] && [ ! -f "loopwork.config.ts" ]; then
    echo "❌ Error: Please run this script from the examples/basic-json-backend directory"
    exit 1
fi

echo "📋 Current Tasks:"
cat .specs/tasks/tasks.json | grep -A 2 '"id"'
echo ""

echo "Choose an option:"
echo "1) Dry Run (preview without executing)"
echo "2) Run Loopwork (execute tasks)"
echo "3) Reset tasks to pending"
echo "4) View task details"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🔍 Running dry-run..."
        bun run ../../src/index.ts --dry-run
        ;;
    2)
        echo ""
        echo "⚡ Running Loopwork..."
        bun run ../../src/index.ts
        ;;
    3)
        echo ""
        echo "🔄 Resetting all tasks to pending..."
        cat > .specs/tasks/tasks.json << 'EOF'
{
  "tasks": [
    {
      "id": "TASK-001",
      "status": "pending",
      "priority": "high"
    },
    {
      "id": "TASK-002",
      "status": "pending",
      "priority": "medium"
    },
    {
      "id": "TASK-003",
      "status": "pending",
      "priority": "low"
    }
  ]
}
EOF
        echo "✅ Tasks reset!"
        ;;
    4)
        echo ""
        echo "📄 Task Details:"
        echo ""
        for task in .specs/tasks/TASK-*.md; do
            echo "----------------------------------------"
            head -5 "$task"
            echo ""
        done
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
