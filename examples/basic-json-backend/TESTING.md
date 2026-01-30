# Testing Guide

This document explains how to test the loopwork example.

## Quick Start

### Option 1: Interactive Menu

```bash
./quick-start.sh
```

Choose from:
1. **Dry Run** - Preview tasks without executing
2. **Run Loopwork** - Execute tasks with AI
3. **Reset tasks** - Reset all tasks to pending status
4. **View task details** - See task descriptions

### Option 2: Direct Commands

```bash
# Dry run (preview)
bun run dry-run

# Actually execute
bun run start

# With explicit flags
bun ../../src/index.ts --dry-run
bun ../../src/index.ts --cli claude --timeout 600
```

## Testing Checklist

### 1. Config Loading

```bash
bun ../../src/index.ts --dry-run 2>&1 | grep "CLI:"
# Should show: CLI: claude (from config)

bun ../../src/index.ts --dry-run 2>&1 | grep "Max Iterations:"
# Should show: Max Iterations: 10 (from config)
```

### 2. Dry Run Mode

```bash
bun ../../src/index.ts --dry-run 2>&1 | grep "Dry Run:"
# Should show: Dry Run: true

bun ../../src/index.ts 2>&1 | grep "Dry Run:"
# Should show: Dry Run: false
```

### 3. Task Priority

```bash
bun ../../src/index.ts --dry-run 2>&1 | grep "Task:" | head -1
# Should show: Task: TASK-001 (high priority first)
```

### 4. Config Override

```bash
bun ../../src/index.ts --cli opencode --dry-run 2>&1 | grep "CLI:"
# Should show: CLI: opencode (CLI arg overrides config)
```

## Manual Testing

### Test 1: Complete Workflow

1. Reset tasks: `echo "3" | ./quick-start.sh`
2. Check status: `cat .specs/tasks/tasks.json`
3. Run dry-run: `bun run dry-run`
4. Verify output shows all 3 tasks

### Test 2: Task Execution

⚠️ **Warning**: This will actually execute AI commands!

```bash
# Make sure you want to run this
bun run start

# Monitor in another terminal
tail -f .loopwork/runs/basic-example/*/logs/iteration-*.txt
```

### Test 3: State Management

```bash
# Start execution
bun run start

# In another terminal, send SIGINT
kill -INT <pid>

# Should save state and show:
# "State saved. Resume with: --resume"

# Resume
bun ../../src/index.ts --resume
```

## Debugging

### Enable Debug Mode

```bash
# Method 1: Environment variable
LOOPWORK_DEBUG=true bun ../../src/index.ts --dry-run

# Method 2: CLI flag
bun ../../src/index.ts --debug --dry-run
```

### Check Command Being Executed

```bash
bun ../../src/index.ts --debug --dry-run 2>&1 | grep "Executing:"
# Shows: [model-name] Executing: <command>
```

### Verify Config File Loading

```bash
# Should NOT show warning about failed config load
bun ../../src/index.ts --dry-run 2>&1 | head -5
```

## Common Issues

### "No pending tasks found"

Tasks have been completed. Reset them:
```bash
echo "3" | ./quick-start.sh
```

### "Another loopwork is running"

Remove the lock file:
```bash
rm -rf .loopwork-*.lock
```

### Config not loading

Make sure you're in the correct directory:
```bash
pwd
# Should be: .../examples/basic-json-backend

ls loopwork.config.js
# Should exist
```

### --dry-run not working

This was a known issue that's now fixed. Update to latest code:
```bash
git pull origin main
```

## Success Criteria

All of these should pass:

- ✅ `./quick-start.sh` shows interactive menu
- ✅ `bun run dry-run` shows 3 pending tasks
- ✅ Config values are loaded (claude CLI, 10 max iterations, 300s timeout)
- ✅ `--dry-run` flag shows "Dry Run: true"
- ✅ Tasks are shown in priority order (TASK-001 first)
- ✅ Command being executed is displayed

## Next Steps

After testing the basic example:

1. Try modifying the config (change CLI, timeouts, etc.)
2. Create your own tasks in `.specs/tasks/`
3. Experiment with task dependencies
4. Add plugins (Telegram, cost tracking, etc.)
