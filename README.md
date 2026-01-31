# Loopwork 🔁

> **AI-powered task automation with pluggable backends and extensible integrations**

[![npm version](https://img.shields.io/npm/v/@loopwork-ai/loopwork.svg)](https://www.npmjs.com/package/@loopwork-ai/loopwork)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Loopwork is an extensible task automation framework that runs AI CLI tools (Claude, OpenCode, Gemini) against task backlogs from various sources (GitHub Issues, JSON files, or custom backends). Features a Next.js-style composable plugin architecture for integrations with time tracking, notifications, and project management tools.

## 🎯 What Loopwork Does

Loopwork automates repetitive task execution by coordinating AI tools with task management systems. You define tasks (as Markdown files or GitHub Issues), and Loopwork orchestrates AI models to complete them automatically with:

- **Real-time execution** - Watch AI models work through your task backlog in real-time
- **Smart retries** - Automatic failover between AI models if one fails
- **Cost awareness** - Track token usage and enforce daily budgets
- **Rich notifications** - Get updates via Telegram, Discord, or Slack
- **Production-ready** - State persistence, orphan process cleanup, health checks

**Real-world use case:** You have 50 TypeScript refactoring tasks. You write a task description once, and Loopwork orchestrates your AI model to execute all 50 tasks, tracking progress, retrying failures, and notifying you when done.

## ✨ Key Features

- 🤖 **Multiple AI Backends** - Support for Claude, OpenCode, and Gemini
- 📋 **Flexible Task Sources** - GitHub Issues, JSON files, with plugin support for custom backends
- 🔌 **Plugin Architecture** - Next.js-style config with composable plugins
- ⏱️ **Time Tracking** - Everhour integration with daily limits
- 📊 **Project Management** - Asana, Todoist sync
- 🔔 **Notifications** - Telegram bot & Discord webhooks
- 💰 **Cost Tracking** - Token usage and cost monitoring
- 🌳 **Sub-tasks & Dependencies** - Hierarchical task structures
- 🤖 **Dynamic Task Creation** - Automatic follow-up task generation based on output analysis
- 🔧 **MCP Server** - Model Context Protocol for AI tool integration
- 📺 **Real-time Streaming** - Live output from AI execution
- 🎯 **Smart Retries** - Automatic failover between AI models

---

## ⚡ Zero to Hero: Get Started in 5 Minutes

This guide will take you from **zero setup** to running your first **AI task orchestration** in under 5 minutes. No prior experience needed!

### PHASE 1: Prerequisites Setup (2 minutes)

You need exactly two things to get started. **Copy and paste** these commands into your terminal:

#### Step 1A: Install JavaScript Runtime

**Choose ONE option below:**

**Bun (Recommended - Fastest):**
```bash
curl -fsSL https://bun.sh/install | bash
# Close and reopen your terminal
bun --version
```

**OR Node.js (if you prefer):**
```bash
# macOS with Homebrew
brew install node

# Or download from: https://nodejs.org/ (LTS version)

node --version
```

> ✅ **Must See:** A version number like `1.0.0`. If you see "command not found", restart your terminal and try again.

#### Step 1B: Install AI CLI Tool

**Claude Code (Recommended - Easiest Setup):**
- Go to https://claude.ai/code and click "Install"
- Follow the on-screen setup steps (installs automatically)
- In a new terminal window, verify: `claude --version`
- **This is the recommended option** - it's the most reliable and easiest to set up

**OR OpenCode (Alternative):**
- Visit https://opencode.sh/ for installation instructions
- Download and install the appropriate binary for your OS
- Verify: `opencode --version`

**OR Use any AI CLI that accepts prompts:**
- If you have another AI CLI tool that can process text prompts, you can configure Loopwork to use it
- Just make sure the CLI is in your PATH

> ✅ **Must See:** A version number when you run `claude --version` (or your chosen CLI). If "command not found", restart your terminal and try again.
>
> **Note:** This guide uses Claude Code in all examples. If you use a different CLI, adjust the commands accordingly.

### PHASE 2: Clone & Build Loopwork (2 minutes)

Copy and paste these commands **exactly as shown**:

```bash
# Clone the repository
git clone https://github.com/nadimtuhin/loopwork.git
cd loopwork

# Install dependencies (this takes 30-60 seconds)
bun install
# OR if using Node.js: npm install

# Build Loopwork (REQUIRED - don't skip this step!)
bun run build
# OR if using Node.js: npm run build
```

> ✅ **Verify it worked:** Run this command. You should see the loopwork binary (about 50MB):
> ```bash
> ls -lh packages/loopwork/bin/loopwork
> ```
> Expected output: `-rwxrwxrwx ... 50M ... packages/loopwork/bin/loopwork`
>
> ❌ **If you see "No such file or directory":** The build failed. Common fixes:
> - Make sure you're in the `loopwork` directory: `pwd` should end with `/loopwork`
> - Try cleaning and rebuilding: `rm -rf node_modules && bun install && bun run build`
> - Check for error messages during the build step above

### PHASE 3: Run Your First AI Task (1 minute)

```bash
# Navigate to the example
cd examples/basic-json-backend

# Verify everything is ready
./verify-setup.sh
```

**If all checks pass** (you'll see green ✅ marks), continue:

```bash
# Option A: Interactive menu (recommended for first time)
./quick-start.sh
# Then select: 4) Reset and Run (fresh start)

# Option B: Direct commands (if you prefer)
./quick-start.sh --reset
./quick-start.sh --run
```

> 🎯 **What happens next:**
> - Loopwork will launch Claude AI to work through 3 sample tasks
> - You'll see real-time output in your terminal as Claude reads each task and works on it
> - Claude will create files, write code, run tests - all automatically
> - Each task takes 30-90 seconds
> - Total time: 2-5 minutes
> - **You don't need to do anything** - just watch!

### 🎬 What You'll See

When you run `./quick-start.sh --run`, the terminal will display real-time output:

```
⚡ Running Loopwork...

📋 TASK-001: Create Hello World function
⏳ Running Claude...
   > Creating file: hello.ts
   > Writing helloWorld function
   > Running tests
✅ Completed in 2.3s

📋 TASK-002: Add Sum function
⏳ Running Claude...
   > Adding sum function to math.ts
   > Updating tests
✅ Completed in 1.8s

📋 TASK-003: Create README
⏳ Running Claude...
   > Creating README.md with documentation
   > Adding examples
✅ Completed in 3.1s

📊 Summary:
   ✅ 3 completed
   ❌ 0 failed
   ⏱️ Duration: 7.2s
```

The AI will:
1. Read each task description from `.specs/tasks/TASK-*.md` files
2. Execute the work (creating/modifying files, running tests)
3. Mark the task complete and move to the next one
4. Show you a summary when done

**No intervention needed.** You just watch it work!

### 🧠 What Just Happened

**You didn't write any code.** You didn't copy-paste into ChatGPT. You just ran Loopwork, and it acted as a **Project Manager**:

1. **Loaded** 3 task descriptions ✓
2. **Assigned** each task to Claude AI ✓
3. **Monitored** execution in real-time ✓
4. **Verified** results and marked tasks complete ✓
5. **Showed you a summary** ✓

Imagine scaling this to **50 refactoring tasks**, **100 documentation updates**, or **1000 code fixes**. Running automatically. While you sleep. That is the power of Loopwork.

---

### 🚀 Quick Reference

**Already set up? Just want to run tasks?** Copy-paste this:

```bash
cd loopwork/examples/basic-json-backend
./verify-setup.sh           # Quick sanity check (should see all ✅)
./quick-start.sh --reset    # Reset tasks to "pending"
./quick-start.sh --run      # Run tasks and watch AI work!
```

**First time? Use this full setup:**

```bash
git clone https://github.com/nadimtuhin/loopwork.git
cd loopwork

# Install and build (30-60 seconds)
bun install && bun run build

# Run example
cd examples/basic-json-backend
./verify-setup.sh           # Must show all green ✅
./quick-start.sh --run      # Watch AI complete 3 tasks!
```

---

## 🔧 Troubleshooting Guide

### Pre-Flight Checklist

Before troubleshooting, verify you completed all setup steps:

```bash
# 1. Check JavaScript runtime is installed
bun --version || node --version
# ✅ Should show version number

# 2. Check AI CLI is installed
which claude || which opencode || which gemini
# ✅ Should show a file path like /usr/local/bin/claude

# 3. Check loopwork is built
ls -la ../../packages/loopwork/bin/loopwork
# ✅ Should show the binary file

# 4. Check you're in the right directory
pwd
# ✅ Should end with: .../loopwork/examples/basic-json-backend
```

If any of these fail, that's your issue. Fix it below:

---

### Installation Issues

#### "Command not found: bun"

**What this means:** Bun installed but can't be found in your PATH.

**Quick fix:**
```bash
# Restart your terminal completely (close and open a new one)
# Then try again
bun --version
```

**If that doesn't work:**
```bash
# Check where Bun was installed
ls -la ~/.bun/bin/bun

# Add Bun to PATH manually
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# Reload shell
source ~/.bashrc

# Verify
bun --version
```

**Can't fix it? Use Node.js instead:**
```bash
# Install Node.js (v18+) from https://nodejs.org
node --version

# Then use 'npm' instead of 'bun' for all commands:
npm install      # instead of: bun install
npm run build    # instead of: bun run build
```

#### "Command not found: claude" (or opencode/gemini)

**What this means:** Your AI CLI isn't installed or not found in PATH.

**Step-by-step fix:**

1. **First, restart your terminal completely:**
   - Close your terminal window entirely
   - Open a new terminal window
   - Try again: `which claude`

   (Many PATH issues are fixed by restarting!)

2. **If still not found, reinstall Claude Code:**
   ```bash
   # Visit https://claude.ai/code
   # Download and run the installer
   # Follow on-screen prompts

   # After installation, restart terminal and verify:
   which claude
   claude --version
   ```

3. **If Claude Code installer doesn't work, check:**
   - Make sure you downloaded from the official site: https://claude.ai/code
   - Check system requirements (macOS, Windows, or Linux)
   - Look for error messages during installation
   - Try running from terminal: `~/Applications/Claude.app/Contents/MacOS/claude` (macOS example)

4. **If Claude won't work, try OpenCode instead:**
   ```bash
   # Visit https://opencode.sh/ for download links
   # Download and install for your OS
   # Then verify:
   opencode --version

   # Then edit loopwork.config.js:
   # Change: cli: 'claude'
   # To:     cli: 'opencode'
   ```

5. **Verify the fix:**
   ```bash
   # Should show a file path (not "not found")
   which claude

   # Should show version (not error)
   claude --version

   # Try a simple test
   echo "What is 2+2?" | claude
   ```

### Configuration Issues

#### "Config file not found" or "loopwork.config.js not found"

**What this means:** Loopwork can't find the configuration file.

**Fix:**

1. **Verify you're in the right directory:**
   ```bash
   pwd
   # ✅ Should end with: /examples/basic-json-backend

   # Check the config file exists
   ls -la loopwork.config.js
   # ✅ Should show the file
   ```

2. **If in wrong directory:**
   ```bash
   cd examples/basic-json-backend
   ./quick-start.sh --run
   ```

3. **If config file is missing:**
   - This shouldn't happen if you cloned the repo correctly
   - Try re-cloning: `git clone https://github.com/nadimtuhin/loopwork.git`

4. **If you modified the config and broke it:**
   ```bash
   # Valid configuration format:
   module.exports = {
     backend: {
       type: 'json',
       tasksFile: '.specs/tasks/tasks.json'
     },
     cli: 'claude',
     maxIterations: 10
   }

   # Check for syntax errors - common mistakes:
   # ❌ Missing commas between properties
   # ❌ Quotes around values (use: 'value' not value)
   # ❌ Trailing commas in objects
   ```

### Task Loading Issues

#### "No tasks found" or all tasks show as "completed"

**What this means:** Tasks exist but are all marked as "completed" from a previous run.

**Quick fix:**
```bash
./quick-start.sh --reset
./quick-start.sh --run
```

**Detailed verification:**

1. **Check task file is valid:**
   ```bash
   cat .specs/tasks/tasks.json | jq .
   # ✅ Should show valid JSON with a "tasks" array
   # ❌ If it shows "parse error", the JSON is broken
   ```

2. **Check task status:**
   ```bash
   ./quick-start.sh --status
   # ✅ You should see: TASK-001: pending, TASK-002: pending, etc.
   # ❌ If all show "completed", run: ./quick-start.sh --reset
   ```

3. **Check task description files exist:**
   ```bash
   ls .specs/tasks/TASK-*.md
   # ✅ Should show: TASK-001.md, TASK-002.md, TASK-003.md
   ```

4. **Check file structure:**
   ```bash
   # Correct structure:
   examples/basic-json-backend/
   ├── .specs/tasks/
   │   ├── tasks.json         ✅ Must exist
   │   ├── TASK-001.md        ✅ Must exist
   │   └── TASK-002.md        ✅ Must exist
   └── loopwork.config.js     ✅ Must exist
   ```

### Execution Issues

#### Task seems stuck (no output for 30+ seconds)

**Symptom:** Task starts but no output, AI seems frozen

**Solutions:**
1. **Check AI CLI is responsive:**
   ```bash
   # Test the CLI directly
   claude --version

   # Or try a simple command
   echo "test" | claude "what is 2+2?"
   ```

2. **Increase timeout if task is just slow:**
   ```typescript
   // In loopwork.config.ts
   export default compose(
     withCli({
       models: [
         ModelPresets.claudeSonnet({ timeout: 600 })  // increased from 300
       ]
     }),
     // ...
   )(defineConfig({
     timeout: 900,  // increased from 600
   }))
   ```

3. **Check API rate limits:**
   - Claude: max 5 concurrent requests
   - OpenCode: check your plan limits
   - Wait a few minutes and try again

4. **Stop and check logs:**
   ```bash
   # Press Ctrl+C to stop

   # Check what happened
   cat .loopwork/runs/*/logs/iteration-*.txt | tail -20
   ```

#### Task fails with error

**Symptom:** Task marked as failed with error message

**Common errors and solutions:**

**"API key not found" or "Unauthorized"**
```bash
# AI CLI needs API key setup
claude --version  # might prompt for setup

# Or set environment variable
export ANTHROPIC_API_KEY="your-key-here"
loopwork
```

**"Timeout exceeded"**
```typescript
// Task took longer than timeout
// Option 1: Increase timeout
export default compose(
  // ...
  withCli({
    models: [
      ModelPresets.claudeSonnet({ timeout: 600 })  // 10 minutes
    ]
  }),
)(defineConfig({
  timeout: 900,
}))
```

**"Task failed to parse"**
```bash
# Task description file might be invalid
# Check the .md file
cat .specs/tasks/TASK-001.md

# Should have this structure:
# # TASK-001: Title
# ## Goal
# Description
# ## Requirements
# - Req 1
# - Req 2
```

### Verification Steps

After fixing an issue, verify Loopwork works:

```bash
# 1. Verify AI CLI works
claude --version
# Expected: version number

# 2. Verify config loads
cat loopwork.config.js
# Expected: valid JavaScript/TypeScript

# 3. Verify tasks exist
cat .specs/tasks/tasks.json | jq .
# Expected: valid JSON with pending tasks

# 4. Verify task descriptions exist
ls .specs/tasks/TASK-*.md
# Expected: list of markdown files

# 5. Try a dry-run
loopwork --dry-run
# Expected: list of tasks to execute

# 6. Try actual run
loopwork
# Expected: tasks execute with status updates
```

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Run with debug output
loopwork --debug

# Or set environment variable
export DEBUG=loopwork:*
loopwork
```

This shows:
- Configuration being loaded
- Backend initialization
- Task selection logic
- CLI invocation details
- Full response output

### Check Logs

Every run saves detailed logs:

```bash
# Find latest run
ls -t .loopwork/runs/ | head -1
# Shows: 2024-01-31-14-23-45/

# View current task prompt
cat .loopwork/runs/2024-01-31-14-23-45/logs/current-prompt.md

# View iteration details
cat .loopwork/runs/2024-01-31-14-23-45/logs/iteration-1-prompt.md
cat .loopwork/runs/2024-01-31-14-23-45/logs/iteration-1-output.txt

# View state
cat .loopwork/runs/2024-01-31-14-23-45/state.json
```

### Getting Help

If you're still stuck:

1. **Check the examples:**
   ```bash
   cat examples/basic-json-backend/README.md
   ```

2. **Read architecture docs:**
   ```bash
   cat packages/loopwork/docs/ARCHITECTURE.md
   ```

3. **Search GitHub issues:**
   Visit: https://github.com/nadimtuhin/loopwork/issues

4. **File a new issue with:**
   - Your OS: `uname -a`
   - Runtime version: `bun --version` or `node --version`
   - Error message (copy-paste)
   - Steps to reproduce
   - Your config file (sanitize API keys)
   - Recent logs from `.loopwork/runs/`

### Performance & Optimization

**Speed up task execution:**
```typescript
// Use faster, cheaper models first
export default compose(
  withCli({
    models: [
      ModelPresets.claudeHaiku({ timeout: 120 }),      // Fast, cheap
      ModelPresets.claudeSonnet({ timeout: 300 }),     // Balanced
    ],
    fallbackModels: [
      ModelPresets.claudeOpus({ timeout: 600 }),       // Slow, expensive
    ]
  }),
)(defineConfig({
  maxIterations: 10,
}))
```

**Reduce API costs:**
```typescript
// Use cost tracking to enforce daily budget
export default compose(
  withCostTracking({
    enabled: true,
    dailyBudget: 10.00,  // Stop if daily cost exceeds $10
  }),
  // ...
)(defineConfig({}))
```

**Monitor resource usage:**
```bash
# Check for orphan processes
cat .loopwork/orphan-events.log

# See what consumed the most time
cat .loopwork/runs/*/logs/iteration-*.txt | grep Duration
```

## 🎓 Next Steps: Beyond the Basics

Now that you've successfully run Loopwork, here are ways to expand your usage:

### 1. Add More Tasks

Create new tasks to automate more of your workflow:

```bash
# Edit task registry
nano .specs/tasks/tasks.json

# Add a new task
{
  "id": "TASK-004",
  "status": "pending",
  "priority": "high"
}

# Create task description
nano .specs/tasks/TASK-004.md
```

**Task description template:**
```markdown
# TASK-004: Your Task Title

## Goal
One-sentence summary of what should be accomplished.

## Requirements
- Specific requirement 1
- Specific requirement 2
- Specific requirement 3

## Example (optional)
Show example code or output.

## Success Criteria
- How to verify the task is complete
- What files should exist
- What should work correctly
```

### 2. Try Different AI Models

Loopwork supports Claude, OpenCode, and Gemini. Test different models:

```typescript
// loopwork.config.ts - try different models
export default compose(
  withCli({
    models: [
      ModelPresets.claudeHaiku({ timeout: 120 }),      // Fast, cheap
      ModelPresets.claudeSonnet({ timeout: 300 }),     // Balanced
      ModelPresets.geminiFlash({ timeout: 300 }),      // Fast alternative
    ],
    fallbackModels: [
      ModelPresets.claudeOpus({ timeout: 600 }),       // Heavy tasks
    ]
  }),
)(defineConfig({
  maxIterations: 50,
}))
```

Then run:
```bash
loopwork --cli opencode  # or specify different model
```

### 3. Add Notifications

Get updates via Telegram, Discord, or Slack:

```typescript
// loopwork.config.ts
export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  // Add Telegram notifications
  withTelegram({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    notifyOnComplete: true,
    notifyOnFail: true,
  }),

  // Or add Discord webhooks
  // withDiscord({
  //   webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  //   notifyOnComplete: true,
  // }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

Set environment variables:
```bash
export TELEGRAM_BOT_TOKEN="your-token-here"
export TELEGRAM_CHAT_ID="your-chat-id-here"
```

### 4. Enable Cost Tracking

Monitor API spending and set daily budgets:

```typescript
// loopwork.config.ts
export default compose(
  // ... other plugins

  withCostTracking({
    enabled: true,
    dailyBudget: 10.00,  // Stop if over $10/day
  }),

)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

Check costs:
```bash
loopwork --debug  # Shows cost info
```

### 5. Use GitHub as Task Source

Instead of JSON files, pull tasks from GitHub Issues:

```typescript
// loopwork.config.ts
export default compose(
  // Switch from JSON to GitHub
  withGitHubBackend({
    repo: 'myorg/myrepo',  // Your GitHub repo
    label: 'loopwork-task', // Filter to issues with this label
  }),

  // ... other plugins
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

On GitHub, create issues with:
- Label: `loopwork-task` - Marks it as a task
- Label: `priority:high` - Set priority
- Label: `feature:auth` - Feature area (for filtering)

### 6. Set Up Time Tracking

Track time spent on tasks with Everhour:

```typescript
// loopwork.config.ts
export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  withEverhour({
    autoStartTimer: true,   // Start timer when task begins
    autoStopTimer: true,    // Stop when task completes
  }),

)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### 7. Enable Dynamic Task Creation

Automatically create follow-up tasks based on completed work:

```typescript
// loopwork.config.ts
export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  withDynamicTasks({
    enabled: true,
    analyzer: 'pattern',        // Fast: looks for TODO, FIXME, etc.
    // analyzer: 'llm',          // Smart: Claude analyzes output
    createSubTasks: true,
    maxTasksPerExecution: 5,
    autoApprove: true,
  }),

)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

When AI completes a task and outputs "TODO: refactor this", Loopwork automatically creates a follow-up task.

### 8. Sync with Asana or Todoist

Keep your task manager in sync:

```typescript
// loopwork.config.ts
export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  // Sync with Asana
  withAsana({
    projectId: process.env.ASANA_PROJECT_ID,
    syncStatus: true,  // Update Asana when tasks complete
  }),

  // Or sync with Todoist
  // withTodoist({
  //   projectId: process.env.TODOIST_PROJECT_ID,
  //   syncStatus: true,
  // }),

)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### 9. Deep Dive Into Documentation

Read detailed guides for advanced features:

```bash
# Core architecture
cat packages/loopwork/docs/ARCHITECTURE.md

# CLI execution and model selection
cat packages/loopwork/docs/cli-invocation-algorithm.md

# Process management
cat packages/loopwork/docs/orphan-process-management.md

# Full package README
cat packages/loopwork/README.md
```

### 10. Create Custom Plugins

Build your own plugins to extend Loopwork:

```typescript
// loopwork.config.ts
import { withPlugin } from '@loopwork-ai/loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  // Custom plugin example
  withPlugin({
    name: 'my-custom-plugin',

    onLoopStart: (namespace) => {
      console.log(`Starting tasks in: ${namespace}`)
    },

    onTaskStart: (task) => {
      console.log(`📋 Starting: ${task.id}`)
    },

    onTaskComplete: (task, result) => {
      console.log(`✅ Completed: ${task.id} in ${result.duration}s`)
    },

    onTaskFailed: (task, error) => {
      console.log(`❌ Failed: ${task.id} - ${error}`)
      // Send alert, log to external service, etc.
    },

    onLoopEnd: (stats) => {
      console.log(`📊 Done: ${stats.completed}/${stats.total}`)
    },
  }),

)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### Learning Resources

- **Examples:** Browse `examples/` directory for working setups
- **Tests:** Check `packages/loopwork/test/` for usage patterns
- **Source:** Read `packages/loopwork/src/` to understand internals
- **GitHub:** See real projects using Loopwork

### Community & Support

- **GitHub Issues:** Report bugs or request features
- **Discussions:** Join conversations about usage patterns
- **Examples:** Share your own Loopwork configurations
- **Plugins:** Build and share custom plugins with the community

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT © [Nadim Tuhin](https://github.com/nadimtuhin)

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh)
- Powered by Claude, OpenCode, and Gemini AI models
- Inspired by modern task automation workflows

---

**Star ⭐ this repo if you find it useful!**
