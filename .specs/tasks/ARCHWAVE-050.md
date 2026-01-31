# ARCHWAVE-050: Migrate Planner and Executor Logic

## Goal
Move the Prometheus (planning) and Sisyphus (execution) logic from core into the new agents package. Implement the `IAgent` interface.

HOW: Extract logic from `CliExecutor` and `RunCommand`. Create `PrometheusAgent` and `SisyphusAgent` classes. Use dependency injection for CLI tools.

WHY: These are distinct responsibilities currently mixed in the runner.
## Files
- `packages/agents/src/prometheus.ts`
- `packages/agents/src/sisyphus.ts`
- `packages/agents/src/registry.ts`
## Dependencies
Depends on: ARCHWAVE-049
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Handling context limits
- CLI failures

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test agent planning logic with mocked CLI input
