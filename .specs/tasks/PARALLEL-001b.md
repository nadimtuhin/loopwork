# PARALLEL-001b: Parallel: Add --parallel and --sequential CLI flags

## Goal
Add parseParallelOption() helper (returns 2 if no value). Add .option('--parallel [count]') and .option('--sequential') to commander. Update Config interface. Add merge logic in getConfig(). Register flags in index.ts run command and RUN_ARGS.

## Requirements
- Create `parseParallelOption(value)` helper - returns 2 if undefined
- Add `--parallel [count]` option to commander
- Add `--sequential` option (sets parallel=1)
- Update Config interface with parallel field
- Merge logic: CLI > config file > default
- Register in RUN_ARGS array

## Success Criteria
- [ ] `--parallel` defaults to 2 workers
- [ ] `--parallel 3` uses 3 workers
- [ ] `--sequential` forces single worker
- [ ] Config file parallel setting works
