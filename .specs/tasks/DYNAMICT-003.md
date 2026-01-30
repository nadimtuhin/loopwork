# DYNAMICT-003: Create withDynamicTasks plugin for automatic task creation

## Goal
Implement the core plugin that hooks into task completion and creates new tasks based on analysis.

## Requirements:
1. Create `plugins/dynamic-tasks.ts` with `withDynamicTasks(options)` factory function
2. Plugin implements `LoopworkPlugin` with:
   - `onBackendReady`: Store backend reference for task creation
   - `onTaskComplete`: Analyze results and create tasks if needed
   - `onTaskFailed`: Optionally analyze failures for remediation tasks

3. Options interface:
   ```typescript
   interface DynamicTasksOptions {
     enabled?: boolean
     analyzer?: TaskAnalyzer  // Custom or default pattern analyzer
     createSubTasks?: boolean  // Create as sub-tasks of completed task
     maxTasksPerExecution?: number  // Limit per task completion
     autoApprove?: boolean  // Create immediately or queue for approval
     logCreatedTasks?: boolean  // Log new tasks to console
   }
   ```

4. Integration with existing plugin system via compose pattern

## Acceptance Criteria:
- Works with both sequential and parallel execution modes
- Respects backend's createTask/createSubTask availability
- Logs created tasks with logger.info
- Does not block main loop execution
- Includes integration test with JsonTaskAdapter

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
