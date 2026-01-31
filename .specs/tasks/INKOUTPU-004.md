# INKOUTPU-004: Create unified Ink application container

## Goal
Build main Ink app container that orchestrates all output components:

Acceptance Criteria:
- Create src/output/InkApp.tsx as main container component
- Implement layout manager (full-screen TUI vs inline output mode)
- Add event subscription and state management
- Create output buffer for historical logs (scrollback)
- Support split view (current task + logs)
- Add keyboard shortcuts (q to quit, scroll up/down)
- Integrate with existing dashboard/tui.tsx components
- Handle graceful fallback to plain text for non-TTY

Implementation Hints:
- Use ink's useInput and useFocus hooks for interactivity
- Use ink-text-input for future interactive features
- Store last N events for scrollback (configurable limit)
- Support two modes: dashboard (full-screen) and inline (progressive output)
- Use Box component for layout (flexbox-like)
- Reference dashboard/tui.tsx for Header, Footer, Stats components
- Add --tui flag to commands for full-screen mode

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
