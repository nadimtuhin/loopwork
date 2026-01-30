# PROC-001g: Process Management: E2E Tests (Full Loop Scenario)

## Goal
E2E tests simulating real failure scenarios. Test: 1) Start loopwork → crash parent → orphan cleaned on next start, 2) Multiple namespaces → each cleans own orphans, 3) Timeout scenario → stale process killed.

## Requirements

### Crash Recovery Test
- Start loopwork as subprocess
- Kill parent abruptly
- Start new instance
- Verify orphan cleanup

### Multi-Namespace Test
- Start multiple namespaces
- Verify isolation
- Clean orphans per namespace

### Timeout Test
- Start process with timeout
- Let it exceed timeout
- Verify stale process killed

## Success Criteria
- [ ] Orphans cleaned on restart
- [ ] Namespaces isolated
- [ ] Timeouts enforced
