# Git Auto-Commit Example

This example demonstrates how to use the `withGitAutoCommit()` plugin to automatically create git commits after each task completion.

## Setup

```bash
# Navigate to this directory
cd examples/git-autocommit

# Install dependencies
bun install

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Create some tasks
mkdir -p .specs/tasks
cat > .specs/tasks/tasks.json << 'EOF'
{
  "tasks": [
    {
      "id": "FEAT-001",
      "title": "Add user authentication",
      "description": "Implement JWT-based authentication\n- Create login endpoint\n- Add token validation middleware",
      "status": "pending"
    }
  ]
}
EOF

# Run loopwork
npx loopwork
```

## What Happens

1. **Task Execution**: Loopwork picks up and executes `FEAT-001`
2. **Task Completion**: When the task completes successfully
3. **Auto-Commit**: The plugin automatically:
   - Stages all changes (`git add -A`)
   - Creates a commit with a structured message
   - Includes task metadata in the commit

## Commit Message Example

```
feat(FEAT-001): Add user authentication

Implement JWT-based authentication
- Create login endpoint
- Add token validation middleware

Task: FEAT-001
Iteration: 1
Namespace: default

Co-Authored-By: Loopwork AI <noreply@loopwork.ai>
```

## Configuration Options

```typescript
withGitAutoCommit({
  // Enable/disable the plugin
  enabled: true,

  // Automatically stage all changes before committing
  // If false, only manually staged changes will be committed
  addAll: true,

  // Add co-author attribution to commit message
  coAuthor: 'Loopwork AI <noreply@loopwork.ai>',

  // Skip commit if no changes are detected
  // If false, will attempt to commit even with no changes
  skipIfNoChanges: true,

  // Scope of files to commit (default: 'all')
  // - 'all': Commit all changed files (respects addAll setting)
  // - 'task-only': Only commit files changed during this specific task
  // - 'staged-only': Only commit files already staged (ignores addAll)
  scope: 'all',
})
```

## Error Handling

The plugin gracefully handles errors and won't fail your tasks:

- ✅ **Not a git repo**: Silently skips (no error)
- ✅ **No changes**: Skips commit if `skipIfNoChanges: true`
- ✅ **Git commit fails**: Logs warning but doesn't fail the task
- ✅ **Task failed**: Doesn't commit if task failed

## Benefits

1. **Automatic Commit Chunking**: Each task gets its own commit
2. **Clear History**: Easy to see what changed for each task
3. **Easy Rollback**: Revert specific task changes easily
4. **Audit Trail**: Track who/what made changes
5. **Conventional Commits**: Follows conventional commit format

## Scope Options

### `scope: 'all'` (default)
Commits all changed files in the repository. Respects the `addAll` setting.

**Use case**: General-purpose auto-commit for single-task workflows.

### `scope: 'task-only'`
Only commits files that were changed during the execution of this specific task. Files that were already modified before the task started are ignored.

**Use case**: Multiple concurrent tasks or when you want strict isolation between task changes.

**Example**:
```typescript
withGitAutoCommit({ scope: 'task-only' })
```

Before task: `file1.txt` is modified
During task: `file2.txt` is created, `file3.txt` is modified
Commit: Only `file2.txt` and `file3.txt` (task-specific changes)

### `scope: 'staged-only'`
Only commits files that are already staged (via `git add`). Ignores the `addAll` setting.

**Use case**: Fine-grained control over what gets committed. Useful when the task or another plugin manually stages specific files.

**Example**:
```typescript
withGitAutoCommit({ scope: 'staged-only' })
```

## Tips

- Use with `--dry-run` first to preview what would be committed
- Consider disabling for development loops (set `enabled: false`)
- Customize `coAuthor` to match your team's preferences
- Use `scope: 'task-only'` for parallel execution or multi-task scenarios
- Use `scope: 'staged-only'` when you need precise control over committed files
- Combine with other plugins for a complete workflow
