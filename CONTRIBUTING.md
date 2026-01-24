# Contributing to Loopwork 🤝

Thank you for your interest in contributing to Loopwork! This guide will help you get started with development and make your first contribution.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Creating a Plugin](#creating-a-plugin)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Submitting Changes](#submitting-changes)
- [Getting Help](#getting-help)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0.0 or higher
- Node.js v20.0.0 or higher (for compatibility testing)
- Git
- A GitHub account

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/loopwork.git
cd loopwork
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/nadimtuhin/loopwork.git
```

## Development Setup

### Install Dependencies

```bash
# Install all dependencies for the monorepo
bun install
```

### Build All Packages

```bash
# Build all packages in the monorepo
bun run build
```

### Run Tests

```bash
# Run all tests
bun test

# Run tests for a specific package
bun --cwd packages/loopwork test
```

### Development Mode

```bash
# Watch mode for core package
bun run dev:loopwork

# Watch mode for dashboard
bun run dev:dashboard

# Watch mode for dashboard web UI
bun run dev:web
```

## Project Structure

```
loopwork/
├── packages/
│   ├── loopwork/          # Core package with CLI and orchestration
│   ├── telegram/          # Telegram bot integration plugin
│   ├── discord/           # Discord webhook plugin
│   ├── asana/             # Asana task sync plugin
│   ├── everhour/          # Everhour time tracking plugin
│   ├── todoist/           # Todoist integration plugin
│   ├── cost-tracking/     # Token cost monitoring plugin
│   ├── notion/            # Notion database backend plugin
│   └── dashboard/         # Interactive web dashboard
├── examples/              # Example configurations
│   └── basic-json-backend/
├── docs/                  # Documentation
└── CONTRIBUTING.md        # This file
```

### Key Files

- `packages/loopwork/src/index.ts` - Core exports and main entry point
- `packages/loopwork/src/contracts/` - Plugin contracts and types
- `packages/loopwork/bin/loopwork` - CLI executable
- `packages/*/test/` - Test files for each package

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions or improvements

### 2. Make Your Changes

- Write clean, readable code
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
bun test

# Test specific package
bun --cwd packages/loopwork test

# Test in a real example
cd examples/basic-json-backend
./quick-start.sh
```

### 4. Commit Your Changes

Follow our [commit guidelines](#commit-guidelines) below.

### 5. Keep Your Branch Updated

```bash
git fetch upstream
git rebase upstream/main
```

## Testing

### Running Tests

```bash
# All tests
bun test

# Watch mode
bun test --watch

# Specific test file
bun test packages/loopwork/test/cli.test.ts
```

### Writing Tests

We use Bun's built-in test runner. Test files should:
- Be named `*.test.ts`
- Be placed in `test/` directories
- Cover new functionality and edge cases

Example test:

```typescript
import { describe, test, expect } from 'bun:test'
import { yourFunction } from '../src/your-module'

describe('yourFunction', () => {
  test('should do something', () => {
    const result = yourFunction('input')
    expect(result).toBe('expected')
  })
})
```

### Test Coverage

Aim for:
- 80%+ coverage for new code
- All public APIs tested
- Edge cases and error conditions covered

## Creating a Plugin

Loopwork uses a composable plugin architecture. Here's how to create a new plugin:

### 1. Create Package Structure

```bash
mkdir -p packages/your-plugin/{src,test}
cd packages/your-plugin
```

### 2. Create package.json

```json
{
  "name": "@loopwork/your-plugin",
  "version": "0.1.0",
  "main": "src/index.ts",
  "scripts": {
    "test": "bun test"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  }
}
```

### 3. Implement Plugin Contract

```typescript
// src/index.ts
import type {
  LoopworkPlugin,
  ConfigWrapper,
  TaskContext,
  PluginTaskResult,
} from 'loopwork/contracts'

export interface YourPluginConfig {
  apiKey?: string
  enabled?: boolean
  notifyOnComplete?: boolean
}

/**
 * Config wrapper to add plugin settings to config
 */
export function withYourPlugin(config: YourPluginConfig = {}): ConfigWrapper {
  return (baseConfig) => ({
    ...baseConfig,
    yourPlugin: {
      enabled: config.enabled ?? true,
      apiKey: config.apiKey || process.env.YOUR_PLUGIN_API_KEY,
      notifyOnComplete: config.notifyOnComplete ?? true,
    },
  })
}

/**
 * Plugin implementation with lifecycle hooks
 */
export function createYourPlugin(config: YourPluginConfig = {}): LoopworkPlugin {
  const apiKey = config.apiKey || process.env.YOUR_PLUGIN_API_KEY
  const enabled = config.enabled ?? true

  if (!apiKey || !enabled) {
    return {
      name: 'your-plugin',
      onConfigLoad: (cfg) => {
        console.warn('Your Plugin: Disabled or missing API key')
        return cfg
      },
    }
  }

  return {
    name: 'your-plugin',

    async onTaskStart(context: TaskContext) {
      console.log(`Task ${context.task.id} started`)
      // Your plugin logic here
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!config.notifyOnComplete) return

      console.log(`Task ${context.task.id} completed in ${result.duration}s`)
      // Send notification to external service
    },

    async onTaskFailed(context: TaskContext, error: string) {
      console.error(`Task ${context.task.id} failed: ${error}`)
      // Handle failure
    },
  }
}
```

### 4. Add Tests

```typescript
// test/index.test.ts
import { describe, test, expect } from 'bun:test'
import { withYourPlugin, createYourPlugin } from '../src'

describe('withYourPlugin', () => {
  test('should add plugin config', () => {
    const config = withYourPlugin({ enabled: true })({})
    expect(config.yourPlugin?.enabled).toBe(true)
  })
})

describe('createYourPlugin', () => {
  test('should create plugin with hooks', () => {
    const plugin = createYourPlugin({ enabled: true, apiKey: 'test' })
    expect(plugin.name).toBe('your-plugin')
    expect(plugin.onTaskComplete).toBeDefined()
  })

  test('should warn when disabled', () => {
    const plugin = createYourPlugin({ enabled: false })
    expect(plugin.onConfigLoad).toBeDefined()
    expect(plugin.onTaskComplete).toBeUndefined()
  })
})
```

### 5. Document Your Plugin

Add a README.md explaining:
- What the plugin does
- Configuration options
- Usage examples
- Required environment variables

See existing plugin implementations for reference:
- `packages/telegram/src/index.ts` - Telegram bot integration
- `packages/discord/src/index.ts` - Discord webhooks
- `packages/everhour/src/index.ts` - Time tracking integration

## Code Style

### TypeScript

- Use TypeScript for all code
- Enable strict mode
- Properly type all functions and exports
- Avoid `any` - use `unknown` if type is truly unknown

### Formatting

The project currently doesn't enforce a specific formatter. Please:
- Use consistent indentation (2 spaces)
- Follow the existing code style in the file you're editing
- Let TypeScript strict mode guide your code quality

### Best Practices

- **Keep functions small and focused** - Single responsibility
- **Use descriptive names** - `getUserTasks()` not `get()`
- **Avoid deep nesting** - Early returns preferred
- **Handle errors gracefully** - Always catch and log errors
- **Comment complex logic** - Explain *why*, not *what*

## Commit Guidelines

We follow conventional commit format for better changelog generation:

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Test additions or changes
- `chore` - Build process or tooling changes

### Examples

```bash
feat(telegram): add message threading support

Add support for Telegram message threads to group related
notifications together.

Closes #123
```

```bash
fix(core): prevent duplicate task execution

Tasks were being executed twice when resuming from state.
Added deduplication check in task queue.
```

### Logical Chunking

When making multiple changes:
1. **Separate commits for separate concerns**
2. **Pure refactoring separate from features**
3. **Tests with the code they test**

Example sequence:
```bash
git commit -m "refactor: extract task validator to separate module"
git commit -m "feat(core): add task priority support"
git commit -m "test(core): add tests for task priority"
git commit -m "docs: update README with priority feature"
```

## Submitting Changes

### Before Submitting

- [ ] All tests pass (`bun test`)
- [ ] No TypeScript errors (`bun run build`)
- [ ] Code follows existing style guidelines
- [ ] Documentation updated if needed
- [ ] Commit messages follow guidelines
- [ ] Branch is up to date with main
- [ ] Security audit passes (runs automatically in CI)

### Pull Request Process

1. **Push your branch to your fork**

```bash
git push origin feature/your-feature-name
```

2. **Open a Pull Request on GitHub**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changed and why
   - Add screenshots for UI changes

3. **PR Template**

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests added/updated
- [ ] Manual testing completed
- [ ] All tests passing

## Related Issues
Closes #123
```

4. **Respond to Review Feedback**
   - Address comments promptly
   - Push additional commits if needed
   - Mark conversations as resolved

5. **Squash and Merge**
   - Maintainers will squash commits when merging
   - Ensure your PR title follows commit guidelines

## Security

If you discover a security vulnerability:
1. **DO NOT** open a public issue
2. See `SECURITY.md` for reporting instructions and security policies
3. We will respond within 48 hours

## Getting Help

### Questions?

- **GitHub Discussions** - Ask questions and share ideas
- **GitHub Issues** - Report bugs and request features
- **Discord** - Join our community (link in README)

### Resources

- [Full Documentation](./packages/loopwork/README.md)
- [Examples](./examples/)
- [Changelog](./packages/loopwork/CHANGELOG.md)
- [Security Policy](./SECURITY.md)
- [Roadmap](./ROADMAP.md)

## Recognition

Contributors will be recognized in:
- Release notes
- README contributors section
- GitHub insights

Thank you for contributing to Loopwork! 🎉

---

**Questions?** Open a [GitHub Discussion](https://github.com/nadimtuhin/loopwork/discussions)
