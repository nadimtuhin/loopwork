/**
 * Claude Code Integration Plugin
 *
 * Auto-detects Claude Code and creates skill files + updates CLAUDE.md
 */

import type { LoopworkPlugin } from '../contracts/plugin'
import { logger } from '../core/utils'
import fs from 'fs'
import path from 'path'

export interface ClaudeCodePluginOptions {
  enabled?: boolean
  skillsDir?: string
  claudeMdPath?: string
}

export function createClaudeCodePlugin(options: ClaudeCodePluginOptions = {}): LoopworkPlugin {
  const {
    enabled = true,
    skillsDir = '.claude/skills',
    claudeMdPath = 'CLAUDE.md'
  } = options

  return {
    name: 'claude-code',
    classification: 'enhancement',

    onConfigLoad(config) {
      if (!enabled) return config

      // Detect Claude Code installation
      const hasClaudeDir = fs.existsSync('.claude')
      const hasClaudeMd = fs.existsSync('CLAUDE.md') || fs.existsSync('.claude/CLAUDE.md')

      if (!hasClaudeDir && !hasClaudeMd) {
        // Claude Code not detected, skip
        return config
      }

      // Setup Claude Code integration on first run
      setupClaudeCodeIntegration(config, skillsDir, claudeMdPath)

      return config
    }
  }
}

function setupClaudeCodeIntegration(config: Record<string, unknown>, skillsDir: string, claudeMdPath: string) {
  // Create skills directory
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true })
  }

  // Create loopwork skill file
  const skillFile = path.join(skillsDir, 'loopwork.md')
  const skillContent = generateSkillContent(config)

  if (!fs.existsSync(skillFile)) {
    fs.writeFileSync(skillFile, skillContent)
    logger.success(`Created ${skillFile}`)
  }

  // Update CLAUDE.md
  updateClaudeMd(config, claudeMdPath)
}

function generateSkillContent(_config: Record<string, unknown>): string {
  return `# Loopwork Skills

Use these skills when working with Loopwork AI task automation.

## /loopwork:run

Run the loopwork task automation loop.

**When invoked:**
1. Explain what loopwork will do (run AI against task backlog)
2. Execute: \`npx loopwork\` or \`bunx loopwork\`
3. Stream output and monitor progress
4. Report completion status

## /loopwork:resume

Resume a previous loopwork session from saved state.

**When invoked:**
1. Check if \`.loopwork/state.json\` exists
2. Execute: \`npx loopwork --resume\`
3. Show resumed state (current task, iteration count)
4. Continue monitoring

## /loopwork:status

Check current loopwork state and progress.

**When invoked:**
1. Read \`.loopwork/state.json\` if exists
2. Display:
   - Current task ID and title
   - Iteration count / max iterations
   - Completed tasks count
   - Failed tasks count
   - Circuit breaker state
3. Suggest next actions

## /loopwork:task-new

Create a new task in the backlog.

**When invoked for JSON backend:**
1. Ask user for task details:
   - Title (required)
   - Priority (high/medium/low)
   - Description
2. Generate task ID (auto-increment: TASK-001, TASK-002, etc.)
3. Add task to \`.specs/tasks/tasks.json\`
4. Create PRD file: \`.specs/tasks/{TASK-ID}.md\`
5. Confirm task created

**When invoked for GitHub backend:**
1. Ask for task details
2. Create GitHub issue with appropriate labels
3. Return issue URL

## /loopwork:config

Show current loopwork configuration.

**When invoked:**
1. Read \`loopwork.config.ts\` or \`loopwork.config.js\`
2. Display:
   - Backend type (JSON/GitHub)
   - AI CLI tool (claude/opencode/gemini)
   - Max iterations
   - Enabled plugins
   - Cost tracking settings (if enabled)
`
}

function updateClaudeMd(config: Record<string, unknown>, claudeMdPath: string) {
  // Determine actual CLAUDE.md location
  let actualPath = claudeMdPath
  if (fs.existsSync('.claude/CLAUDE.md')) {
    actualPath = '.claude/CLAUDE.md'
  } else if (!fs.existsSync(claudeMdPath)) {
    actualPath = claudeMdPath // Will create it
  }

  const backendType = config.backend?.type || 'JSON'
  const cliTool = config.cli || 'opencode'

  const loopworkSection = `
## Loopwork Integration

This project uses [Loopwork](https://github.com/nadimtuhin/loopwork) for AI-powered task automation.

### Available Skills

- \`/loopwork:run\` - Run the task automation loop
- \`/loopwork:resume\` - Resume a previous session
- \`/loopwork:status\` - Check current state and progress
- \`/loopwork:task-new\` - Create a new task
- \`/loopwork:config\` - View configuration

### Configuration

- **Config file**: \`loopwork.config.ts\`
- **Backend**: ${backendType}
- **AI CLI**: ${cliTool}
- **Tasks**: \`.specs/tasks/\` (JSON) or GitHub Issues
- **State**: \`.loopwork/\`

### Quick Start

\`\`\`bash
# Install loopwork
bun add loopwork

# Run task automation
npx loopwork

# Resume previous session
npx loopwork --resume

# View tasks (JSON backend)
cat .specs/tasks/tasks.json
\`\`\`

### Task Structure (JSON Backend)

- **Task registry**: \`.specs/tasks/tasks.json\`
- **PRD files**: \`.specs/tasks/{TASK-ID}.md\`
- **Templates**: \`.specs/tasks/templates/\`

### Workflow

1. Create tasks in backlog (JSON file or GitHub Issues)
2. Run \`npx loopwork\` to start automation
3. AI CLI (${cliTool}) processes tasks one by one
4. Monitor progress in \`.loopwork/\`
5. Resume with \`--resume\` flag if interrupted
`

  let content = ''
  if (fs.existsSync(actualPath)) {
    content = fs.readFileSync(actualPath, 'utf-8')

    // Check if Loopwork section already exists
    if (content.includes('## Loopwork Integration')) {
      logger.info('CLAUDE.md already has Loopwork integration section')
      return
    }

    // Append to existing file
    content += '\n' + loopworkSection
  } else {
    // Create new CLAUDE.md
    content = `# Claude Code Configuration

This file provides instructions for Claude Code when working on this project.

` + loopworkSection
  }

  fs.writeFileSync(actualPath, content)
  logger.success(`Updated ${actualPath} with Loopwork integration`)
}

// Factory function with convenient naming
export function withClaudeCode(options?: ClaudeCodePluginOptions) {
  return createClaudeCodePlugin(options)
}
