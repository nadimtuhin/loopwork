# INKOUTPU-001: Create Ink output architecture and contracts

## Goal
Define the foundational architecture for Ink-based output system:

Acceptance Criteria:
- Create src/output/contracts.ts with output event interfaces (TaskStartEvent, TaskCompleteEvent, LogEvent, etc.)
- Create src/output/renderer.ts with OutputRenderer interface (render, renderEvent, subscribe)
- Create src/output/ink-renderer.tsx with base InkRenderer class implementing OutputRenderer
- Add output mode configuration (ink, json, silent) to config contracts
- Ensure backward compatibility with existing JSON output mode

Implementation Hints:
- Event types should cover all current logger methods (info, warn, error, success, debug, trace, raw)
- Include streaming events for CLI subprocess output
- Use pub/sub pattern similar to existing dashboard TUI
- Support both TTY and non-TTY environments
- Reference existing dashboard/tui.tsx for Ink patterns

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
