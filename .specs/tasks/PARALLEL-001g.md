# PARALLEL-001g: Parallel: Integrate ParallelRunner into run command

## Goal
In commands/run.ts: import ParallelRunner, add parallel info to startup log, add branch after pendingCount check (if parallel > 1 call runParallel), create runParallel() function with signal handlers, resume support, plugin hooks. Add saveParallelState/loadParallelState/clearParallelState helpers. Update examples in createRunCommand().

## Requirements
- Import ParallelRunner
- Log parallel config on startup
- Branch: parallel > 1 → runParallel()
- Signal handlers (SIGINT, SIGTERM)
- Resume from saved state
- State persistence helpers
- Update CLI examples

## Success Criteria
- [ ] Parallel mode activates with flag
- [ ] Clean shutdown on signals
- [ ] Resume works after interrupt
