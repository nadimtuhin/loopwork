# PARALLEL-001a: Parallel: Add config types (parallel, parallelFailureMode)

## Goal
Add ParallelFailureMode type ('continue'|'abort-all'), parallel field (number), and parallelFailureMode field to LoopworkConfig. Update DEFAULT_CONFIG with parallel:1, parallelFailureMode:'continue'. Export new type from contracts/index.ts.

## Requirements
- Add `ParallelFailureMode` type: `'continue' | 'abort-all'`
- Add `parallel: number` field to LoopworkConfig
- Add `parallelFailureMode: ParallelFailureMode` field
- Update DEFAULT_CONFIG: `parallel: 1, parallelFailureMode: 'continue'`
- Export from contracts/index.ts

## Success Criteria
- [ ] Types compile without errors
- [ ] DEFAULT_CONFIG has new fields
- [ ] Types exported from contracts
