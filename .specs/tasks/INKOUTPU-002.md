# INKOUTPU-002: Migrate core logger to event-based system

## Goal
Refactor core/utils.ts logger to emit events instead of direct stdout writes:

Acceptance Criteria:
- Convert logger object methods to emit OutputEvent objects
- Add renderer injection to logger initialization
- Maintain backward compatibility with existing logger API
- Update StreamLogger to emit streaming events
- Add logger.setRenderer() method for dynamic renderer switching
- Ensure all log levels (info, warn, error, etc.) emit appropriate events
- Preserve timestamp, color, and metadata in events

Implementation Hints:
- Use EventEmitter or custom pub/sub for event distribution
- Keep logger.raw() for direct rendering bypass (used by output components)
- Add migration flag to gradually enable Ink renderer
- Test with existing logger consumers to ensure no breaking changes
- Reference ora/chalk usage patterns for metadata preservation

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
