# Integration Check Skill

Use this skill when completing features that involve data flowing through multiple components.

## When to Use

Invoke `/integration-check` when:
- Adding new config properties
- Creating plugins that modify config
- Building features that span multiple files/layers
- Before marking a task as complete

## Checklist

### 1. Identify the Data Flow

Map out how data flows through the system:

```
Entry Point → Transform 1 → Transform 2 → ... → Consumer
```

For config changes, the typical flow is:
```
loopwork.config.ts → loadConfigFile() → getConfig() → CliExecutor/Backend
```

### 2. Check Each Seam

For EACH arrow (→) in your data flow:
- [ ] Is there a test that crosses this seam?
- [ ] Does the test verify the actual value, not just existence?

### 3. Silent Default Check

Search for fallback patterns in your changes:

```bash
# Find potential silent defaults
git diff HEAD~1 | grep -E '\|\||??'
```

For each fallback found:
- [ ] What happens if the primary value is lost?
- [ ] Will the system still "work" with wrong behavior?
- [ ] Is there a test that catches this?

### 4. Config Property Propagation

If you added a config property, verify it exists in:

```bash
# Check all config construction sites
git grep "const config.*=" -- "*.ts" | grep -v test
git grep "const.*Config.*=" -- "*.ts" | grep -v test
```

Checklist:
- [ ] Type/interface (`contracts/`)
- [ ] Default config (`DEFAULT_CONFIG`)
- [ ] Config loading (`loadConfigFile`)
- [ ] Config merging (`getConfig`)
- [ ] Validation (`validateConfig`)
- [ ] Consumer code
- [ ] Integration test

### 5. Integration Test Template

Add a test like this:

```typescript
describe('Feature Integration', () => {
  test('data flows from config file to consumer', async () => {
    // 1. Create config with the feature enabled
    const config = compose(
      withMyFeature({ ... }),
    )(defineConfig({ ... }))

    // 2. Verify intermediate steps preserve data
    expect(config.myFeature).toBeDefined()

    // 3. Verify consumer receives correct data
    // (may need to mock or use test fixtures)
  })
})
```

## Quick Commands

```bash
# Find all places that build config objects
git grep "const config" -- "src/**/*.ts" | grep -v test

# Find all places using optional chaining on config
git grep "config\?\." -- "src/**/*.ts"

# Find fallback defaults that might hide bugs
git grep -E "(\|\| ['\"a-z])" -- "src/**/*.ts"

# Run integration tests only
bun test --grep "integration"
```

## Example: The cliConfig Bug

This skill was created after a bug where:
1. `withCli()` correctly added `cliConfig` to config object
2. `getConfig()` built a new config object but FORGOT to include `cliConfig`
3. System fell back to default `opencode` instead of configured `claude`
4. All unit tests passed because they tested steps 1 and 2 separately
5. No integration test verified the full path

The fix was one line: `cliConfig: fileConfig?.cliConfig`

The lesson: Always test the full data flow, not just individual steps.
