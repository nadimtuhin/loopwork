# Failure State Method Name Fix

## The Problem

When running parallel execution, tasks would fail with:
```
❌ ERROR: failureState.resetFailure is not a function
```

## Root Cause

The `FailureStateManager` class in `failure-state.ts` has a method called `clearFailure(taskId)`, but the code in `parallel-runner.ts` was calling `resetFailure(taskId)` which doesn't exist.

This was likely caused by a refactoring where the method was renamed but the call site wasn't updated.

## The Fix

Changed line 542 in `packages/loopwork/src/core/parallel-runner.ts`:

```typescript
// Before (incorrect)
failureState.resetFailure(task.id)

// After (correct)
failureState.clearFailure(task.id)
```

## Files Changed

- `packages/loopwork/src/core/parallel-runner.ts` - Fixed method call from `resetFailure` to `clearFailure`

## Impact

This fix allows parallel execution to properly clear failure states when tasks complete successfully, preventing the runtime error that was causing worker failures.
