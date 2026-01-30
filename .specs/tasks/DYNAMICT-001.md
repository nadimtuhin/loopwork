# DYNAMICT-001: Define TaskAnalysis contract and result parsing interface

## Goal
Create the core contracts for analyzing task execution results and determining if new tasks are needed.

## Requirements:
1. Create `contracts/analysis.ts` with:
   - `TaskAnalysisResult` interface containing: `shouldCreateTasks: boolean`, `suggestedTasks: SuggestedTask[]`, `reason: string`
   - `SuggestedTask` interface with: `title`, `description`, `priority`, `dependsOn?`, `isSubTask: boolean`
   - `TaskAnalyzer` interface with method: `analyze(task: Task, result: PluginTaskResult): Promise<TaskAnalysisResult>`

2. Export from `contracts/index.ts`

## Acceptance Criteria:
- Types are well-documented with JSDoc comments
- Supports both creating new top-level tasks and sub-tasks
- Result includes reasoning for traceability
- Compatible with existing Task and PluginTaskResult types

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
