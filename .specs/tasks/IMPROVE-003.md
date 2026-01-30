# IMPROVE-003: Add end-to-end integration test for init workflow

## Goal
Create a comprehensive integration test that validates the entire `loopwork init` workflow from start to finish.

## Current State
- Unit tests exist for individual components
- No full end-to-end test of the complete init workflow
- Manual testing required to verify the complete experience

## Requirements
- [ ] Create integration test file: `test/init-e2e.test.ts`
- [ ] Test complete workflow:
  1. Run init in temporary directory
  2. Verify all files created:
     - `loopwork.config.ts` with correct imports
     - `.gitignore` with required patterns
     - `README.md` with project info
     - `.loopwork-state/` directory
     - `.specs/tasks/` structure (for JSON backend)
     - `.specs/tasks/templates/` with feature and bugfix templates
     - Sample task and PRD files
  3. Verify generated config can be imported
  4. Verify config composition works
  5. Test with different backend choices (JSON, GitHub)
  6. Test with different plugin selections
- [ ] Test non-interactive mode
- [ ] Test interactive mode (if possible in test environment)
- [ ] Test idempotency (running init twice)
- [ ] Test error handling (e.g., permission denied)

## Acceptance Criteria
- Integration test covers full workflow
- Test runs in CI environment
- Test is deterministic and reproducible
- Test cleanup (removes temp files)
- Test passes consistently

## Technical Notes
- Use a temporary directory for test isolation
- Mock or provide environment variables for plugins
- Consider using `process.env.LOOPWORK_NON_INTERACTIVE=true`
- Clean up test artifacts after each test

## Success Metrics
- Test execution time < 5 seconds
- 100% coverage of init workflow
- Catches regressions in file generation
