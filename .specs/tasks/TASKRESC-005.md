# TASKRESC-005: Update findNextTask to filter by scheduledFor

## Goal
Modify findNextTask in both backends to exclude tasks scheduled for future dates.

Requirements:
- Update findNextTask in packages/loopwork/src/backends/json.ts to filter tasks by scheduledFor
- Update findNextTask in packages/loopwork/src/backends/github.ts with same logic
- Only return tasks where scheduledFor is null or <= current time
- Maintain existing dependency and priority filtering

Acceptance Criteria:
- Tasks with future scheduledFor are excluded from findNextTask
- Tasks with no scheduledFor are treated as immediately available
- Tasks with past scheduledFor are included
- Existing task filtering logic (dependencies, priority) still works
- Both backends implement consistent behavior

Implementation Hints:
- Filter in listPendingTasks or findNextTask
- Use new Date() for current timestamp comparison
- Parse scheduledFor string to Date for comparison
- Handle null/undefined scheduledFor gracefully

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
