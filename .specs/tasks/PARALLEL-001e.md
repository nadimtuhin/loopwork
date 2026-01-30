# PARALLEL-001e: Parallel: Create ParallelRunner class

## Goal
Create src/core/parallel-runner.ts with: WORKER_COLORS array, WorkerResult/ParallelState/ParallelRunnerOptions/ParallelRunStats interfaces, ParallelRunner class with run() method (worker pool via Promise.allSettled, circuit breaker check), runWorker() method (claim task, create context, call hooks, execute CLI, handle success/failure), abort(), getState(), resetInterruptedTasks(), getStats().

## Requirements
- WORKER_COLORS for colored output per worker
- Interfaces for state and results
- Promise.allSettled for parallel workers
- Circuit breaker integration
- Plugin hooks (onTaskStart, onTaskComplete, onTaskFailed)
- Abort support for cleanup
- State export for resume

## Success Criteria
- [ ] Workers run in parallel
- [ ] Tasks claimed atomically
- [ ] Circuit breaker stops on failures
- [ ] Clean abort on signals
