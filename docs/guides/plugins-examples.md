# Documentation Plugins - Complete Guide

Automatically update documentation files (CHANGELOG.md, README.md, custom files) after task completion.

## Available Plugins

### 1. **withChangelogOnly** (Recommended)
Auto-updates CHANGELOG.md only - lightweight and focused.

```typescript
import { withChangelogOnly } from "@loopwork-ai/loopwork/plugins";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),

  withChangelogOnly({
    cli: 'claude',
    model: 'haiku',  // Fast & cheap
    style: {
      changelogFormat: 'keepachangelog',
      includeTaskId: true,
      maxLines: 10,
    },
  }),
)(defineConfig({ ... }));
```

### 2. **withFullDocumentation**
Updates both CHANGELOG.md and README.md.

```typescript
import { withFullDocumentation } from "@loopwork-ai/loopwork/plugins";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),

  withFullDocumentation({
    cli: 'claude',
    model: 'haiku',
    files: {
      readme: true,
      changelog: true,
      custom: ['docs/API.md'],  // Additional files
    },
  }),
)(defineConfig({ ... }));
```

### 3. **withDocumentation** (Custom)
Full control over what gets documented.

```typescript
import { withDocumentation } from "@loopwork-ai/loopwork/plugins";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),

  withDocumentation({
    enabled: true,
    cli: 'claude',
    model: 'haiku',

    files: {
      readme: false,
      changelog: true,
      custom: ['docs/ARCHITECTURE.md', 'docs/API.md'],
    },

    style: {
      changelogFormat: 'conventional',  // or 'keepachangelog' or 'simple'
      includeTaskId: true,
      maxLines: 10,
    },

    skip: {
      taskPatterns: [/^test:/i, /^chore:/i],  // Skip test and chore tasks
      labels: ['no-docs', 'internal'],
    },
  }),
)(defineConfig({ ... }));
```

## Configuration Options

### `files` Options
```typescript
files: {
  readme: boolean,      // Update README.md
  changelog: boolean,   // Update CHANGELOG.md
  custom: string[],     // Additional files to update
}
```

### `style` Options
```typescript
style: {
  changelogFormat: 'keepachangelog' | 'conventional' | 'simple',
  includeTaskId: boolean,    // Include task ID in entries
  maxLines: number,          // Max lines per entry
}
```

### `skip` Options
```typescript
skip: {
  taskPatterns: RegExp[],    // Skip tasks matching these patterns
  labels: string[],          // Skip tasks with these labels
}
```

## Changelog Formats

### Keep a Changelog (Default)
```markdown
## Unreleased
### Added
- [TASK-001] New feature description
### Changed
- [TASK-002] Modified behavior
### Fixed
- [TASK-003] Bug fix description
```

### Conventional Commits
```markdown
## Unreleased
- feat(TASK-001): add new feature
- fix(TASK-002): resolve bug
- docs(TASK-003): update documentation
```

### Simple
```markdown
## Unreleased
- 2025-01-31 - TASK-001: New feature description
- 2025-01-31 - TASK-002: Bug fix description
```

## Cost Optimization

Documentation plugins use AI to generate entries. To minimize costs:

1. **Use Haiku model** (default) - 10x cheaper than Sonnet
2. **Changelog only** - Skip README unless needed
3. **Skip internal tasks** - Use `skip` configuration
4. **Limit line count** - Use `maxLines` setting

### Cost Example
```typescript
withChangelogOnly({
  cli: 'claude',
  model: 'haiku',           // ~$0.0001 per update
  style: { maxLines: 5 },   // Shorter = cheaper
  skip: {
    taskPatterns: [/^test:/i, /^chore:/i],  // Skip 50% of tasks
  },
})
```

**Estimated cost:** ~$0.01 per 100 tasks

## Simple Custom Plugin (No AI)

If you don't want to use AI, here's a simple manual documentation plugin:

```typescript
withPlugin({
  name: "simple-changelog",
  async onTaskComplete(context, result) {
    const fs = await import("fs");
    const path = await import("path");

    const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
    const taskTitle = context.task?.title || "Task completed";
    const taskId = context.task?.id || "";
    const date = new Date().toISOString().split("T")[0];

    // Read existing changelog
    let changelog = "";
    if (fs.existsSync(changelogPath)) {
      changelog = fs.readFileSync(changelogPath, "utf-8");
    }

    // Create new entry
    const entry = `- ${date} [${taskId}] ${taskTitle}\n`;

    // Insert after "## Unreleased" header
    if (changelog.includes("## Unreleased")) {
      changelog = changelog.replace(
        "## Unreleased\n",
        `## Unreleased\n${entry}`
      );
    } else {
      changelog = `# Changelog\n\n## Unreleased\n${entry}\n${changelog}`;
    }

    // Write back
    fs.writeFileSync(changelogPath, changelog);
    console.log(`✅ Updated CHANGELOG.md`);
  },
}),
```

## Best Practices

1. **Start with changelog only** - Add README updates later if needed
2. **Use Haiku model** - Fast and cost-effective for documentation
3. **Skip internal tasks** - Avoid documenting tests, chores, etc.
4. **Review generated content** - Check quality before committing
5. **Combine with git auto-commit** - Automatic commit after documentation update

## Example: Full Setup with Documentation

```typescript
import {
  defineConfig,
  compose,
  withJSONBackend,
  withGitAutoCommit,
  createModel,
} from "@loopwork-ai/loopwork";
import { withChangelogOnly } from "@loopwork-ai/loopwork/plugins";
import { withCostTracking } from "@loopwork-ai/cost-tracking";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),

  // Auto-update CHANGELOG.md
  withChangelogOnly({
    cli: 'claude',
    model: 'haiku',
    style: {
      changelogFormat: 'keepachangelog',
      includeTaskId: true,
    },
    skip: {
      taskPatterns: [/^test:/i, /^chore:/i],
      labels: ['no-docs'],
    },
  }),

  // Auto-commit (includes documentation changes)
  withGitAutoCommit({
    enabled: true,
    addAll: true,
    coAuthor: 'Loopwork AI <noreply@loopwork.ai>',
  }),

  // Track costs
  withCostTracking({
    enabled: true,
    defaultModel: "claude-4.5-haiku",
  }),
)(
  defineConfig({
    maxIterations: 500,
    timeout: 600,
    debug: true,
  }),
);
```

## Troubleshooting

### Issue: "Module not found"
**Solution:** Documentation plugins are in the plugins directory. Import like this:
```typescript
import { withChangelogOnly } from "@loopwork-ai/loopwork/plugins";
```

### Issue: Empty or malformed changelog
**Solution:** Ensure your CHANGELOG.md has an `## Unreleased` section:
```markdown
# Changelog

## Unreleased
<!-- New entries will be added here -->

## [1.0.0] - 2025-01-15
- Initial release
```

### Issue: Too expensive
**Solution:** Use skip patterns and Haiku model:
```typescript
withChangelogOnly({
  model: 'haiku',  // Cheapest option
  skip: {
    taskPatterns: [/^test:/i, /^chore:/i, /^docs:/i],
  },
})
```

### Issue: Poor quality documentation
**Solution:** Use better models for important updates:
```typescript
withDocumentation({
  model: 'sonnet',  // Better quality, higher cost
  style: {
    maxLines: 20,  // More detailed
  },
})
```
