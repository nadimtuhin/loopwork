# AI-MONITOR-001i: AI Monitor: CLI Command (loopwork ai-monitor)

## Goal
Create 'loopwork ai-monitor --watch' command and '--with-ai-monitor' flag for 'loopwork start'. Add to CLI help and documentation.

## Requirements

### Standalone Command
```bash
loopwork ai-monitor --watch     # Watch and heal
loopwork ai-monitor --dry-run   # Watch only, no healing
loopwork ai-monitor --status    # Show circuit breaker status
```

### Integration Flag
```bash
loopwork start --with-ai-monitor  # Start with AI monitoring
loopwork run --with-ai-monitor    # Run with AI monitoring
```

### CLI Options
- `--watch`: Enable continuous watching
- `--dry-run`: Detect but don't heal
- `--status`: Show current status
- `--log-dir <path>`: Override log directory

## Success Criteria
- [ ] Standalone command works
- [ ] Integration flag works
- [ ] Help text is clear
