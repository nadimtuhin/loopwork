# CLIOUTPU-004: Add JSON output mode support

## Goal
Add structured JSON output support for CI/CD and scripting use cases.

**Implementation:**
- Add `--json` flag to all major commands (run, status, logs, kill, decompose)
- Create OutputFormat type: 'human' | 'json'
- Modify logger to respect output format
- JSON mode should emit newline-delimited JSON events

**JSON Event Schema:**
```typescript
interface JsonEvent {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'progress' | 'result';
  command: string;
  data: Record<string, unknown>;
}
```

**Commands to update:**
- run: Emit events for iteration start/end, task completion
- status: Output structured process list
- logs: Emit log entries as JSON objects
- kill: Output orphan list and actions as JSON
- decompose: Output generated tasks as JSON

**Acceptance Criteria:**
- All major commands support --json flag
- JSON output is valid, parseable JSON
- JSON events include all relevant data
- Human output remains unchanged when --json not used
- Tests verify JSON output format

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
