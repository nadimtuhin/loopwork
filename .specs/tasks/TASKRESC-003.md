# TASKRESC-003: Implement rescheduleCompleted in JSON backend

## Goal
Implement the rescheduleCompleted method in JsonTaskAdapter with file locking.

Requirements:
- Implement rescheduleCompleted in packages/loopwork/src/backends/json.ts
- Use existing withLock pattern for atomicity
- Reset task status from completed → pending
- Set metadata.scheduledFor if provided
- Validate that task exists and is completed
- Return appropriate error if task not found or not completed

Acceptance Criteria:
- Method uses file locking (withLock)
- Only reschedules tasks with status='completed'
- Sets scheduledFor in metadata if datetime provided
- Returns UpdateResult with success/error info
- Handles edge cases (task not found, not completed)

Implementation Hints:
- Follow updateTaskStatus pattern (lines 777-800)
- Use loadTasksFile → modify → saveTasksFile pattern
- Add validation before status change
- Return meaningful error messages

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
