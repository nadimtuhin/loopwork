#!/bin/bash
# Quick Start Script for Basic JSON Backend Example

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to show help
show_help() {
    echo "🚀 Loopwork Basic Example - Quick Start"
    echo "========================================"
    echo ""
    echo "Usage: ./quick-start.sh [OPTION]"
    echo ""
    echo "Options:"
    echo "  --run, -r              Run Loopwork (execute tasks)"
    echo "  --dry-run, -d          Dry run (preview without executing)"
    echo "  --reset                Reset all tasks to pending status"
    echo "  --reset-run            Reset tasks and run Loopwork"
    echo "  --reset-dry-run        Reset tasks and do a dry run"
    echo "  --status, -s           Show current task status"
    echo "  --tasks, -t            View detailed task descriptions"
    echo "  --help, -h             Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./quick-start.sh --dry-run         # Preview what would happen"
    echo "  ./quick-start.sh --reset           # Reset tasks to pending"
    echo "  ./quick-start.sh --reset-run       # Reset and run (fresh start)"
    echo "  ./quick-start.sh --reset-dry-run   # Reset and preview"
    echo "  ./quick-start.sh --run             # Run Loopwork"
    echo "  ./quick-start.sh                   # Interactive menu"
    echo ""
    exit 0
}

# Function to show current status
show_status() {
    echo -e "${BLUE}📋 Current Task Status:${NC}"
    echo ""
    cat .specs/tasks/tasks.json | grep -E '"id"|"status"' | paste - - | sed 's/[",:]//g' | awk '{printf "  %s: %s\n", $2, $4}'
    echo ""
}

# Function to reset tasks
reset_tasks() {
    echo -e "${YELLOW}🔄 Resetting all tasks to pending...${NC}"
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
    echo -e "${GREEN}✅ Tasks reset to pending!${NC}"
    show_status
}

# Function to view task details
view_tasks() {
    echo -e "${BLUE}📄 Task Details:${NC}"
    echo ""
    for task in .specs/tasks/TASK-*.md; do
        echo "----------------------------------------"
        head -10 "$task"
        echo ""
    done
}

# Function to run dry-run
run_dry_run() {
    echo ""
    echo -e "${BLUE}🔍 Running dry-run...${NC}"
    echo ""
    ../../packages/loopwork/bin/loopwork --dry-run
}

# Function to run loopwork
run_loopwork() {
    echo ""
    echo -e "${GREEN}⚡ Running Loopwork...${NC}"
    echo ""
    ../../packages/loopwork/bin/loopwork
}

# Function to reset and run
reset_and_run() {
    reset_tasks
    echo ""
    run_loopwork
}

# Function to reset and dry-run
reset_and_dry_run() {
    reset_tasks
    echo ""
    run_dry_run
}

# Function to show interactive menu
interactive_menu() {
    echo "🚀 Loopwork Basic Example - Quick Start"
    echo "========================================"
    echo ""

    show_status

    echo "Choose an option:"
    echo "  1) Dry Run (preview without executing)"
    echo "  2) Run Loopwork (execute tasks)"
    echo "  3) Reset tasks to pending"
    echo "  4) Reset and Run (fresh start)"
    echo "  5) Reset and Dry Run (fresh preview)"
    echo "  6) View task details"
    echo "  7) Exit"
    echo ""

    read -p "Enter your choice (1-7): " choice

    case $choice in
        1)
            run_dry_run
            ;;
        2)
            run_loopwork
            ;;
        3)
            reset_tasks
            ;;
        4)
            reset_and_run
            ;;
        5)
            reset_and_dry_run
            ;;
        6)
            view_tasks
            ;;
        7)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Invalid choice${NC}"
            exit 1
            ;;
    esac
}

# Check if we're in the right directory
if [ ! -f "loopwork.config.js" ] && [ ! -f "loopwork.config.ts" ]; then
    echo -e "${RED}❌ Error: Please run this script from the examples/basic-json-backend directory${NC}"
    exit 1
fi

# Parse command line arguments
case "${1:-}" in
    --help|-h)
        show_help
        ;;
    --run|-r)
        run_loopwork
        ;;
    --dry-run|-d)
        run_dry_run
        ;;
    --reset)
        reset_tasks
        ;;
    --reset-run)
        reset_and_run
        ;;
    --reset-dry-run)
        reset_and_dry_run
        ;;
    --status|-s)
        show_status
        ;;
    --tasks|-t)
        view_tasks
        ;;
    "")
        # No arguments, show interactive menu
        interactive_menu
        ;;
    *)
        echo -e "${RED}❌ Unknown option: $1${NC}"
        echo ""
        show_help
        ;;
esac
