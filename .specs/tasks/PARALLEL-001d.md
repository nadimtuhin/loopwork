# PARALLEL-001d: Parallel: Implement claimTask() in JsonTaskAdapter

## Goal
Implement claimTask() in backends/json.ts: wrap in withLock(), load tasks file, filter pending by feature/priority/parent/topLevel, sort by priority, filter blocked tasks via areDependenciesMet(), handle startFrom, mark entry as in-progress, save atomically, return full task.

## Requirements
- Wrap entire operation in withLock()
- Filter: status=pending, feature match, priority sort
- Check areDependenciesMet() for each candidate
- Mark winning task as in-progress
- Save atomically before returning
- Return full Task object

## Success Criteria
- [ ] Atomic claiming works
- [ ] No race conditions under load
- [ ] Dependencies respected
