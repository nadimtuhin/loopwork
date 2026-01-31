# TASKRESC-002: Add rescheduleCompleted method to TaskBackend interface

## Goal
Add new method to TaskBackend contract for rescheduling completed tasks back to pending status.

Requirements:
- Add rescheduleCompleted optional method to TaskBackend interface in packages/loopwork/src/contracts/backend.ts
- Method should take taskId and optional scheduledFor datetime
- Method should reset task from completed → pending status
- Update UpdateResult to include scheduling information

Signature:
rescheduleCompleted?(taskId: string, scheduledFor?: Date): Promise<UpdateResult>

Acceptance Criteria:
- TaskBackend interface includes new method
- Method signature follows existing patterns
- JSDoc documentation explains behavior
- TypeScript compilation succeeds

Implementation Hints:
- Make method optional (use ?) for backward compatibility
- Follow existing method patterns like markCompleted
- Document that this resets status to pending and optionally schedules

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
