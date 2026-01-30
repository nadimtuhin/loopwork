# CLIOUTPU-005: Add verbosity control flags

## Goal
Implement verbosity control for flexible output levels.

**Flags to add:**
- `--quiet` / `-q`: Only show errors and final result
- `--verbose` / `-v`: Show debug-level information
- Multiple -v for increasing verbosity (-vv, -vvv)

**Verbosity Levels:**
- 0 (quiet): Errors only
- 1 (normal): Default, info + warn + error + success
- 2 (verbose): Add debug messages
- 3 (very verbose): Add trace-level details

**Implementation:**
- Add flags to yargs configuration in index.ts
- Pass verbosity to logger configuration
- Suppress spinner and progress in quiet mode
- Add trace logging method to logger

**Integration:**
- Apply to all commands via global flag
- Respect verbosity in logger methods
- Document in --help output

**Acceptance Criteria:**
- --quiet suppresses all but errors
- -v shows additional debug info
- Flags work globally across commands
- Logger respects verbosity setting

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
