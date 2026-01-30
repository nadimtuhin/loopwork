# AI-MONITOR-001a: AI Monitor: Core Infrastructure (LogWatcher + PatternDetector)

## Goal
Create AIMonitor class with event emitter, LogWatcher using chokidar (event-driven + 2s polling), and PatternDetector with regex matchers for known errors.

## Requirements

### AIMonitor Class
- EventEmitter-based for async events
- Events: 'error-detected', 'healing-started', 'healing-completed'
- Start/stop methods

### LogWatcher
- Use chokidar for file watching
- Event-driven with 2s polling fallback
- Watch configured log directories
- Emit new lines as they appear

### PatternDetector
- Regex-based pattern matching
- Known error patterns (build errors, test failures, etc.)
- Severity levels (error, warning, info)
- Context extraction from matches

## Success Criteria
- [ ] LogWatcher detects new log entries
- [ ] PatternDetector identifies known errors
- [ ] Events emitted correctly
