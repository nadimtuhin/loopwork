# IMPROVE-001: Update root loopwork.config.ts to use correct imports

## Goal
Replace legacy import paths in the root loopwork.config.ts with proper package imports to match the production-ready init command output.

## Current State
The root `loopwork.config.ts` file (used for development/testing) uses legacy import paths:
```typescript
import { defineConfig, compose, ... } from './src/loopwork-config-types'
import { withJSONBackend, withGitHubBackend } from './src/backend-plugin'
```

These paths work in the monorepo but don't match what the `init` command generates.

## Requirements
- [ ] Update imports to use proper package imports:
  ```typescript
  import { defineConfig, compose, withPlugin } from 'loopwork'
  import { withJSONBackend, withGitHubBackend } from 'loopwork'
  import { withTelegram } from '@loopwork-ai/telegram'
  import { withCostTracking } from '@loopwork-ai/cost-tracking'
  // etc for other plugins
  ```
- [ ] Ensure the config still works for development/testing
- [ ] Add comments explaining this is for development
- [ ] Verify all tests still pass
- [ ] Build succeeds

## Acceptance Criteria
- Config file uses production-style imports
- All existing functionality preserved
- Tests pass
- Build succeeds

## Notes
- This is a development config, so it can use relative imports if needed
- The key is consistency with what `init` generates
