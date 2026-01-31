# TASKRESC-006: Create reschedule CLI command

## Goal
Create new CLI command for rescheduling completed tasks.

Requirements:
- Create packages/loopwork/src/commands/reschedule.ts
- Command should accept task ID and optional datetime
- Load config and initialize backend
- Call backend.rescheduleCompleted with provided parameters
- Support both 'reschedule to pending now' and 'reschedule to future date'
- Show success/error messages to user
- Follow existing command patterns (task-new.ts)

Command options:
--for <datetime>: ISO 8601 datetime to schedule for (optional)
--feature <name>: Feature filter (for validation)

Acceptance Criteria:
- Command file follows task-new.ts structure
- Validates datetime format if provided
- Shows clear error if task not found or not completed
- Shows success message with rescheduled datetime or 'immediately'
- Handles backend errors gracefully
- Includes dependency injection for testability

Implementation Hints:
- Export async function reschedule(options, deps?)
- Use getBackendAndConfig helper
- Validate ISO 8601 format with new Date()
- Log using logger from utils.ts

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
