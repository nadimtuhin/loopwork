# PROC-001f: Process Management: Integration Tests (Real Processes)

## Goal
Integration tests that spawn real child processes. Test: registry persistence across restarts, orphan detection with real PIDs, cleanup of real processes. Use short-lived test processes.

## Requirements

### Real Process Tests
- Spawn actual child processes (sleep, cat)
- Track in registry
- Verify cleanup works

### Persistence Tests
- Write registry to file
- Restart and reload
- Verify state preserved

### Cleanup Tests
- Orphan detection with real PIDs
- Kill real processes
- Verify termination

## Success Criteria
- [ ] Real processes spawned and tracked
- [ ] Cleanup terminates processes
- [ ] Registry persists correctly
