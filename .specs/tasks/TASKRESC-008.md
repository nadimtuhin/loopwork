# TASKRESC-008: Add tests for reschedule functionality

## Goal
Create comprehensive tests for task rescheduling feature.

Requirements:
- Create test file: packages/loopwork/test/commands/reschedule.test.ts
- Add tests for JsonTaskAdapter.rescheduleCompleted
- Add tests for GithubTaskAdapter.rescheduleCompleted
- Add tests for findNextTask filtering by scheduledFor
- Add tests for reschedule command
- Use Bun test framework (describe, test, expect, mock)

Test cases:
1. Reschedule completed task to pending (immediate)
2. Reschedule completed task with future datetime
3. Error when rescheduling non-completed task
4. Error when task doesn't exist
5. findNextTask excludes future-scheduled tasks
6. findNextTask includes past-scheduled tasks
7. CLI command with valid input
8. CLI command with invalid datetime format

Acceptance Criteria:
- All tests pass with bun test
- Test coverage includes success and error paths
- Mocks backend operations appropriately
- Tests follow existing test patterns in test/
- No global state pollution between tests

Implementation Hints:
- Look at test/backends.test.ts for backend testing patterns
- Look at test/task-new.test.ts for command testing patterns
- Use beforeEach for test setup
- Mock file system operations for JSON backend
- Mock gh CLI for GitHub backend

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
