# DYNAMICT-002: Implement output pattern analyzer for detecting follow-up work

## Goal
Create a pattern-based analyzer that parses CLI output to detect indicators that additional tasks are needed.

## Requirements:
1. Create `analyzers/pattern-analyzer.ts` implementing `TaskAnalyzer` interface
2. Detect common patterns in CLI output:
   - 'TODO:' or 'FIXME:' comments in output
   - 'Next steps:' or 'Follow-up:' sections
   - Error messages suggesting prerequisite work
   - 'Partially completed' or 'needs additional work' phrases
   - Explicit task suggestions from AI (e.g., 'Consider adding...')

3. Parse detected patterns into `SuggestedTask` objects with:
   - Meaningful titles extracted from context
   - Descriptions with relevant output excerpts
   - Priority based on urgency indicators

4. Configuration options: `patterns: string[]`, `enabled: boolean`, `maxTasksPerAnalysis: number`

## Acceptance Criteria:
- Correctly identifies at least 5 common follow-up patterns
- Does not create duplicate suggestions
- Respects maxTasksPerAnalysis limit
- Includes unit tests with sample outputs

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
