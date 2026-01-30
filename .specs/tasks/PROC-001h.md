# PROC-001h: Process Management: CLI Commands (loopwork processes)

## Goal
Add CLI commands for process management: 'loopwork processes list' (show tracked processes), 'loopwork processes clean' (kill orphans), 'loopwork processes clean --force' (kill all). Add --clean-orphans flag to 'loopwork start'.

## Requirements

### Commands
```bash
loopwork processes list           # Show all tracked processes
loopwork processes clean          # Kill orphans only
loopwork processes clean --force  # Kill all tracked processes
```

### Integration Flag
```bash
loopwork start --clean-orphans    # Clean orphans before starting
```

### Output Format
- List shows: PID, namespace, start time, status
- Clean shows: killed count, errors

## Success Criteria
- [ ] List command works
- [ ] Clean command kills orphans
- [ ] Force flag kills all
- [ ] Integration flag works
