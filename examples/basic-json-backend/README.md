# Loopwork Basic JSON Backend Example

Welcome! This example shows you **exactly** how Loopwork works:
1. Reads tasks from a JSON file
2. Invokes AI to complete them
3. Tracks progress in real-time

**What you'll do:** Run 3 sample tasks and watch Claude AI complete them automatically. Takes ~5 minutes.

**Before you start:**
You should have already completed the main README's "Zero to Hero" setup. That means you have:
- ✅ Bun or Node.js installed
- ✅ Claude/OpenCode/Gemini CLI installed
- ✅ Loopwork repo cloned and built (`bun run build`)

**If you haven't done this yet:** Go back to the [main README Setup Guide](../../README.md#-zero-to-hero-get-started-in-5-minutes) and complete it first, then come back here.

## Files in This Example

```
examples/basic-json-backend/
├── README.md                    # This file - your guide
├── verify-setup.sh              # 🆕 Run this first to verify setup
├── quick-start.sh               # Interactive menu to run tasks
├── loopwork.config.js           # Configuration file
├── .specs/tasks/
│   ├── tasks.json              # Task registry
│   ├── TASK-001.md             # Task 1: Create Hello World
│   ├── TASK-002.md             # Task 2: Add Sum function
│   └── TASK-003.md             # Task 3: Create README
├── hello.ts, math.ts            # Example files (AI will modify)
└── *.test.ts                    # Tests (AI will run these)
```

**What each does:**
- **verify-setup.sh** - Checks if everything is ready (run this first!)
- **tasks.json** - Lists all tasks and their current status
- **TASK-*.md** - Contains detailed requirements for what the AI should do
- **loopwork.config.js** - Tells Loopwork which AI to use and how to behave
- **quick-start.sh** - Interactive menu and commands to control Loopwork

## Pre-Flight Checklist ✈️

**RECOMMENDED:** Run our automated verification script to check everything is ready:

```bash
./verify-setup.sh
```

This script checks:
- ✅ Correct directory
- ✅ Bun or Node.js installed
- ✅ AI CLI (Claude/OpenCode) installed
- ✅ Loopwork project built
- ✅ Config and task files exist
- ✅ Scripts are executable

**If all checks pass:** Continue to the next section!

**If checks fail:** The script will tell you exactly what to fix.

<details>
<summary><b>Manual verification (click to expand)</b></summary>

Prefer to check manually? Run these commands:

```bash
# 1. Check you're in the right place
pwd
# ✅ Should end with: loopwork/examples/basic-json-backend

# 2. Check AI CLI is installed and working
which claude  # (or: which opencode)
# ✅ Should show a path like: /usr/local/bin/claude

claude --version  # (or: opencode --version)
# ✅ Should show version number

# 3. Check loopwork was built
ls -la ../../packages/loopwork/bin/loopwork
# ✅ Should show the loopwork binary

# 4. Check script is executable
ls -la quick-start.sh
# ✅ Should show -rwxr-xr-x (has 'x' permission)
```

</details>

**All checks passed?** Continue below. **Something failed?** See [Troubleshooting](#troubleshooting-common-issues).

## Get Started: The Fast Path

You're in the right directory (`examples/basic-json-backend`)? Good. Run these **3 commands**:

```bash
# 1️⃣ Verify everything is ready
./verify-setup.sh

# 2️⃣ Reset tasks to "pending"
./quick-start.sh --reset

# 3️⃣ Run Loopwork!
./quick-start.sh --run
```

✅ **Step 1** should show all green checks. If something fails, fix it and try again.

✅ **Step 2** resets the task status. You'll see output like: `TASK-001: pending, TASK-002: pending, ...`

✅ **Step 3** starts the automation. Watch as Claude AI completes all 3 tasks in 2-5 minutes.

**Prefer interactive?** Skip the commands and just run:
```bash
./quick-start.sh
# Choose: 4) Reset and Run (fresh start)
```

## Understanding the Output

When you run `./quick-start.sh --run`, here's what you'll see:

```
🚀 Starting Loopwork

📋 TASK-001: Create Hello World function
⏳ Running Claude...
   > Creating file: hello.ts
   > Writing function...
   > Running tests...
✅ Completed in 2.3s

📋 TASK-002: Add Sum function
⏳ Running Claude...
   > [AI output here]
✅ Completed in 1.8s

📋 TASK-003: Create README
⏳ Running Claude...
   > [AI output here]
✅ Completed in 3.1s

📊 Summary:
   ✅ 3 completed
   ❌ 0 failed
   ⏱️ Duration: 7.2s
```

### Detailed Breakdown

You'll see several types of output:

**1. Task Execution Progress**
```
[TASK-001: in-progress] Creating Hello World function...
[TASK-001: completed] ✓ Function created and tested successfully
```

**2. AI CLI Output**
Real-time output from your AI model as it works:
```
> Creating file: hello.ts
> Running tests to verify...
> Tests passed: 2/2
```

**3. Final Summary**
```
✅ Loop completed
  - Tasks completed: 3
  - Tasks failed: 0
  - Duration: 7.2s
```

## Adding New Tasks

Want to add a new task? Here's how:

### 1. Add to `tasks.json`

Edit `.specs/tasks/tasks.json` and add:
```json
{
  "id": "TASK-004",
  "status": "pending",
  "priority": "medium"
}
```

### 2. Create the Task File

Create `.specs/tasks/TASK-004.md`:
```markdown
# TASK-004: Your Task Title

## Goal
Brief description of what to do.

## Requirements
- Requirement 1
- Requirement 2

## Success Criteria
- How to verify it's done
```

### 3. Run It

```bash
./quick-start.sh --dry-run
./quick-start.sh --run
```

Done! Loopwork will complete your new task automatically.

## Command Reference

The `quick-start.sh` script provides several convenient commands:

### View Status
```bash
./quick-start.sh --status    # or -s
./quick-start.sh --tasks     # or -t
```

### Run Loopwork
```bash
./quick-start.sh --run                # Execute pending tasks
./quick-start.sh --dry-run            # Preview without executing
./quick-start.sh --reset              # Mark tasks as pending
./quick-start.sh --reset-run          # Reset and execute
./quick-start.sh --reset-dry-run      # Reset and preview
```

### Get Help
```bash
./quick-start.sh --help               # Show all options
./quick-start.sh                      # Interactive menu
```

### Alternative: Run Without Script

If you prefer, you can run Loopwork directly without the script:

```bash
# Using npm
npm run start          # Run with defaults
npm run dry-run       # Dry run mode

# Or using Bun directly (from repository root)
bun --cwd packages/loopwork run start
```

## Configuration Explained

The `loopwork.config.js` file configures how Loopwork behaves:

| Setting | Meaning |
|---------|---------|
| `backend.type: 'json'` | Use JSON file as task source |
| `backend.tasksFile` | Path to tasks.json file |
| `backend.tasksDir` | Directory containing .md files with task details |
| `cli: 'claude'` | Which AI to use (claude, opencode, or gemini) |
| `maxIterations: 10` | Maximum number of tasks to run in one session |
| `timeout: 300` | Timeout per task in seconds (5 minutes) |
| `debug: true` | Show detailed logging |
| `maxRetries: 2` | Retry failed tasks up to 2 times |
| `dynamicTasks.enabled` | Auto-create follow-up tasks from results |

You can modify these settings to customize behavior, but the defaults work well for this example.

## Troubleshooting

**First:** Run `./verify-setup.sh` to diagnose 90% of issues. It will tell you exactly what's wrong.

### Quick Fixes

**❌ "Permission denied: ./quick-start.sh"**
```bash
chmod +x quick-start.sh
./quick-start.sh --run
```

**❌ "No tasks found" or all tasks show "completed"**
```bash
./quick-start.sh --reset  # This always fixes it
./quick-start.sh --run
```

**❌ "Command not found: claude" (or opencode/gemini)**
1. Close your terminal completely
2. Open a new terminal window
3. Try again: `which claude`
4. If still not found, reinstall from main README setup
5. After reinstall, restart terminal again
6. Try: `./quick-start.sh --run`

**❌ "Cannot find module" or "loopwork: command not found"**
```bash
# You didn't build the project
cd ../..  # Go to loopwork root
pwd       # Should show: /path/to/loopwork
bun run build
cd examples/basic-json-backend
./quick-start.sh --run
```

**❌ "AI seems stuck / no output for 30+ seconds"**
```bash
# Test your AI CLI works first
claude --version  # Should show a version
echo "What is 2+2?" | claude  # Should get a response

# If that works, try Loopwork again
./quick-start.sh --run

# If that fails, check for API key setup
# Claude might need: claude auth
```

**❌ Tasks fail with timeout errors**
```bash
# Increase timeout in loopwork.config.js
# Change: timeout: 300
# To:     timeout: 600  (for 10 minutes)
./quick-start.sh --run
```

### Debug Mode

If nothing above fixes it, get more details:

```bash
# Run with debug output
loopwork --debug

# Or check the latest run logs
ls -t .loopwork/runs/ | head -1  # Shows latest run folder
cat .loopwork/runs/*/logs/iteration-1-output.txt  # Shows what happened
```

### Still Stuck?

1. **Verify prerequisites are actually installed:**
   ```bash
   pwd                    # Must end with: /loopwork/examples/basic-json-backend
   bun --version          # Or: node --version
   which claude           # Or: which opencode
   ls -la ../../packages/loopwork/bin/loopwork
   ```

2. **Check files are present and correct:**
   ```bash
   cat loopwork.config.js | head  # Should show config
   cat .specs/tasks/tasks.json    # Should show JSON
   ls .specs/tasks/TASK-*.md      # Should list task files
   ```

3. **See the full troubleshooting guide** in the [main README](../../README.md#-troubleshooting-guide)

## Next Steps

Now that you understand the basics, try:

1. **Modify a Task** - Change the requirements in TASK-001.md and see if the AI can fulfill new requirements
2. **Create Multiple Tasks** - Add TASK-005, TASK-006, etc. for different projects
3. **Run with Different AI** - Edit `loopwork.config.js` to use OpenCode instead of Claude
4. **Add a Plugin** - Explore the main Loopwork documentation to add Telegram notifications or cost tracking
5. **Use Different Backend** - Try the GitHub backend to pull tasks from GitHub Issues

For more advanced usage, see the [main Loopwork documentation](../../README.md).

## Key Concepts

### Task Lifecycle

Each task goes through states:
- **pending** - Waiting to be worked on
- **in-progress** - AI is currently working on it
- **completed** - Successfully finished
- **failed** - AI couldn't complete it (will retry if maxRetries > 0)

### Backend System

Loopwork abstracts different task sources through "backends":
- **JSON Backend** - Tasks from a JSON file (this example)
- **GitHub Backend** - Tasks from GitHub Issues
- **Custom Backends** - Build your own task source

This lets you use the same Loopwork automation for different task sources.

### AI Model Invocation

When you run Loopwork:
1. Load pending task from JSON
2. Read detailed requirements from markdown
3. Invoke AI CLI with task context
4. AI executes the work (coding, writing, etc.)
5. Mark task as completed or failed
6. Move to next task

### Dynamic Tasks (Advanced)

Loopwork can automatically create follow-up tasks based on completed work. For example:
- If AI detects a TODO comment, create a follow-up task
- If AI finds an unhandled error, create a fix task
- If pattern analysis suggests needed work, propose it

This is configured in `loopwork.config.js` with the `dynamicTasks` setting.

## Getting Help

- **This Tutorial** - You're reading it! Re-read sections as needed.
- **Main README** - See the main [Loopwork README](../../README.md) for architecture details
- **Architecture Docs** - Read `packages/loopwork/docs/` for deep dives
- **Issue Tracker** - File bugs or feature requests on GitHub

## What's Happening Behind the Scenes?

When you run `./quick-start.sh --run`, here's what happens:

1. **Load Configuration** - Read `loopwork.config.js`
2. **Initialize Backend** - Connect to JSON file backend
3. **Find Pending Tasks** - Search tasks.json for `status: "pending"`
4. **For Each Task:**
   - Load details from TASK-*.md file
   - Mark as in-progress in tasks.json
   - Invoke Claude/OpenCode CLI with task requirements
   - Monitor execution and capture output
   - Mark as completed or failed
   - Move to next task
5. **Save State** - Update tasks.json with final status
6. **Show Summary** - Display completion statistics

All of this happens automatically—you just run the script!

## Contributing Back

Did you learn something useful? Consider:
- Improving this tutorial with clearer examples
- Adding more sample tasks to teach new concepts
- Fixing typos or unclear sections
- Creating advanced examples

Check the main repository for contribution guidelines.

---

**Happy automating!** 🚀

