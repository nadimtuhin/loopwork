# DYNAMICT-004: Add AI-powered task analysis using LLM

## Goal
Create an optional LLM-based analyzer that uses AI to intelligently detect and structure follow-up tasks.

## Requirements:
1. Create `analyzers/llm-analyzer.ts` implementing `TaskAnalyzer` interface
2. Use existing CliExecutor or lightweight LLM call to analyze output
3. Prompt engineering for task extraction:
   - Provide original task context and execution output
   - Ask LLM to identify incomplete work, blockers, or follow-ups
   - Request structured JSON response matching SuggestedTask format

4. Options:
   ```typescript
   interface LLMAnalyzerOptions {
     model?: string  // Default to fast model (e.g., 'haiku', 'flash')
     timeout?: number
     fallbackToPattern?: boolean  // Use pattern analyzer if LLM fails
   }
   ```

5. Caching: Don't re-analyze identical outputs

## Acceptance Criteria:
- Uses cost-effective model by default
- Has reasonable timeout (30s default)
- Falls back gracefully to pattern analyzer on failure
- Response parsing handles malformed LLM output
- Includes test with mocked LLM response

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
