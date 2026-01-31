# TASKRESC-007: Register reschedule command in CLI

## Goal
Register the new reschedule command in the main CLI entry point.

Requirements:
- Add command registration in packages/loopwork/src/index.ts
- Follow existing command pattern (lines 213-228)
- Command syntax: loopwork reschedule <taskId>
- Options: --for <datetime> (optional)
- Include help description

Command definition:
program
  .command('reschedule <taskId>')
  .description('Reschedule a completed task back to pending')
  .option('--for <datetime>', 'Schedule for future datetime (ISO 8601)')
  .action(async (taskId, options) => { ... })

Acceptance Criteria:
- Command appears in loopwork --help output
- Command invokes reschedule function from commands/reschedule.ts
- Passes taskId and options correctly
- Follows commander.js patterns used in file

Implementation Hints:
- Add after task-new command registration
- Use dynamic import for lazy loading
- Match existing command structure exactly
- Test with loopwork reschedule --help

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
