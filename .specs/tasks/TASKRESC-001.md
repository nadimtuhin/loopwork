# TASKRESC-001: Extend Task interface with scheduling metadata

## Goal
Add scheduledFor field to Task interface to support task scheduling.

Requirements:
- Add optional scheduledFor field to Task metadata in packages/loopwork/src/contracts/task.ts
- Type should be string (ISO 8601 datetime format)
- Add helper type for scheduling metadata
- Update TaskMetadata type to include scheduling information

Acceptance Criteria:
- Task interface includes scheduledFor?: string in metadata
- TypeScript compilation succeeds
- No breaking changes to existing task structure

Implementation Hints:
- Follow existing metadata pattern in task.ts
- Use ISO 8601 format for datetime strings for cross-platform compatibility
- Keep field optional to maintain backward compatibility

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
