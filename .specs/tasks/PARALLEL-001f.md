# PARALLEL-001f: Parallel: Update ICliExecutor interface

## Goal
Add optional taskId parameter to execute() method. Add cleanup(): Promise<void> method for process cleanup on shutdown.

## Requirements
- Add `taskId?: string` parameter to execute()
- Add `cleanup(): Promise<void>` method
- Update implementations

## Success Criteria
- [ ] Interface compiles
- [ ] Cleanup called on shutdown
