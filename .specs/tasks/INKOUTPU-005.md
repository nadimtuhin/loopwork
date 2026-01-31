# INKOUTPU-005: Migrate commands to use Ink output

## Goal
Update all command files to use new Ink-based output system:

Acceptance Criteria:
- Update commands/run.ts to emit events instead of direct logger calls
- Update commands/dashboard.ts to use unified InkApp
- Update commands/decompose.ts, init.ts, telemetry.ts for Ink output
- Update core/cli.ts CLI executor to emit streaming events
- Remove direct console.log calls (except JSON mode)
- Add --output flag (ink, json, plain) to all commands
- Ensure JSON mode still works for programmatic consumption
- Add integration tests for each command's output

Implementation Hints:
- Start with run.ts (most complex output)
- Create event emission helpers (emitTaskStart, emitLogInfo, etc.)
- Preserve existing banner/summary output via events
- Keep JSON mode as separate renderer (JsonRenderer class)
- Add plain text fallback renderer (PlainRenderer) for non-TTY
- Test TTY detection: process.stdout.isTTY
- Use feature flags for gradual rollout

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
