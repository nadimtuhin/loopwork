# DYNAMICT-005: Add configuration and documentation for dynamic task creation

## Goal
Integrate dynamic task creation into the main config system and document usage.

## Requirements:
1. Update `LoopworkConfig` type to include:
   ```typescript
   dynamicTasks?: {
     enabled: boolean
     analyzer: 'pattern' | 'llm' | TaskAnalyzer
     createSubTasks: boolean
     maxTasksPerExecution: number
     autoApprove: boolean
   }
   ```

2. Add `withDynamicTasks` to default exports in `packages/loopwork/src/index.ts`

3. Update example config in `examples/basic-json-backend/loopwork.config.ts`

4. Add documentation:
   - Update ARCHITECTURE.md with Dynamic Task Creation section
   - Add usage examples in main README.md
   - Document analyzer options and customization

5. Add CLI flag: `--no-dynamic-tasks` to disable at runtime

## Acceptance Criteria:
- Config validates dynamicTasks options
- Example demonstrates both pattern and LLM analyzers
- Docs explain when/why to use dynamic task creation
- CLI flag overrides config setting

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
