# PROC-001e: Process Management: Unit Tests (Mocked Dependencies)

## Goal
Comprehensive unit tests using mocked IProcessManager. Test: ProcessRegistry CRUD, OrphanDetector logic, ProcessCleaner sequences. No real processes spawned.

## Requirements

### ProcessRegistry Tests
- Add/remove/get operations
- Persistence to file
- Concurrent access handling

### OrphanDetector Tests
- Mock process list
- Identify orphans correctly
- Handle edge cases (no orphans, all orphans)

### ProcessCleaner Tests
- Clean sequences
- Error handling
- Report generation

## Success Criteria
- [ ] All unit tests pass
- [ ] No real processes spawned
- [ ] Good mock coverage
