# TASKRESC-004: Implement rescheduleCompleted in GitHub backend

## Goal
Implement the rescheduleCompleted method in GithubTaskAdapter using gh CLI.

Requirements:
- Implement rescheduleCompleted in packages/loopwork/src/backends/github.ts
- Use gh CLI to remove 'completed' label and add 'pending' label
- Add comment with reschedule information
- Set scheduledFor in issue body metadata if provided
- Follow existing gh CLI patterns in the file

Acceptance Criteria:
- Uses gh issue edit command to update labels
- Adds comment documenting reschedule action
- Updates issue body with scheduledFor metadata
- Only reschedules issues with 'completed' label
- Returns UpdateResult with success/error info

Implementation Hints:
- Follow existing markCompleted pattern (uses gh CLI)
- Use execa for command execution
- Parse gh CLI output for error handling
- Format datetime in comment for readability

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
