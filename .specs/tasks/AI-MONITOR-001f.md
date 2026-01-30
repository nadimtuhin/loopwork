# AI-MONITOR-001f: Verification Engine

## Goal

Implement a verification engine that enforces the verification-before-completion protocol. The engine ensures healing actions are truly successful by requiring fresh evidence (<5 minutes) and running multiple verification checks (BUILD, TEST, LINT, FUNCTIONALITY, ARCHITECT, TODO, ERROR_FREE) before claiming completion.

## Requirements

### Core Functionality

1. **VerificationEngine Class**
   - Implement `VerificationEngine` class in `src/ai-monitor/verification.ts`
   - Support configurable check types: BUILD, TEST, LINT, FUNCTIONALITY, ARCHITECT, TODO, ERROR_FREE
   - Each check type has: name, command, timeout, required status
   - Return verification result with pass/fail status and evidence

2. **Evidence Freshness**
   - Evidence must be <5 minutes old (configurable TTL, default 300000ms)
   - Track timestamp for each verification check
   - Reject stale evidence automatically
   - Property: `fresh: boolean` on `VerificationEvidence` type

3. **Check Types**
   - **BUILD**: Run build command (e.g., `bun run build`, `tsc --noEmit`)
   - **TEST**: Run test suite (e.g., `bun test`)
   - **LINT**: Run linter (e.g., `eslint`, `biome check`)
   - **FUNCTIONALITY**: Verify feature works as expected
   - **ARCHITECT**: Get architect approval (opus model verification)
   - **TODO**: Ensure no pending todos in task
   - **ERROR_FREE**: Check logs for errors in last 5 minutes

4. **Verification Result**
   - Interface: `VerificationResult`
   - Fields: `passed: boolean`, `checks: CheckResult[]`, `timestamp: Date`, `evidence: VerificationEvidence[]`
   - CheckResult: `check: string`, `passed: boolean`, `output: string`, `duration: number`

5. **Integration with AI Monitor**
   - Add `verification` property to `AIMonitorConfig` interface
   - Call `VerificationEngine.verify()` after healing action completes
   - Only mark healing as successful if verification passes
   - Update circuit breaker based on verification result

### API Design

```typescript
// Verification check type
export type VerificationCheckType =
  | 'BUILD'
  | 'TEST'
  | 'LINT'
  | 'FUNCTIONALITY'
  | 'ARCHITECT'
  | 'TODO'
  | 'ERROR_FREE'

// Verification check configuration
export interface VerificationCheck {
  type: VerificationCheckType
  command?: string
  timeout?: number
  required: boolean
}

// Check result
export interface CheckResult {
  check: string
  passed: boolean
  output: string
  duration: number
  timestamp: Date
}

// Verification result
export interface VerificationResult {
  passed: boolean
  checks: CheckResult[]
  timestamp: Date
  evidence: VerificationEvidence[]
  failedChecks: string[]
}

// Verification engine class
export class VerificationEngine {
  constructor(config: {
    freshnessTTL?: number
    checks?: VerificationCheck[]
    requireArchitectApproval?: boolean
    cwd?: string
  })

  async verify(claim: string, taskId?: string): Promise<VerificationResult>
  isEvidenceFresh(evidence: VerificationEvidence): boolean
  private async runCheck(check: VerificationCheck): Promise<CheckResult>
}
```

### Integration Flow

1. Healing action completes
2. Call `VerificationEngine.verify(claim, taskId)`
3. Engine runs all required checks
4. Check evidence freshness
5. Return `VerificationResult` with pass/fail
6. If passed: record success, update circuit breaker
7. If failed: record failure, trigger circuit breaker

### Configuration

Add to `AIMonitorConfig.verification`:
```typescript
verification: {
  freshnessTTL: 300000,           // 5 minutes
  checks: ['BUILD', 'TEST', 'LINT', 'ERROR_FREE'],
  requireArchitectApproval: false
}
```

### Error Handling

- Timeout on long-running checks (configurable per check)
- Handle missing commands gracefully (e.g., no test script)
- Log all verification attempts
- Include error details in `CheckResult.output`

## Testing

### Unit Tests (`test/ai-monitor/verification.test.ts`)

1. **Evidence Freshness**
   - Fresh evidence (<5 min) passes
   - Stale evidence (>5 min) fails
   - Custom TTL works

2. **Individual Checks**
   - BUILD check runs tsc/build command
   - TEST check runs test command
   - LINT check runs linter
   - ERROR_FREE check scans logs

3. **Verification Result**
   - All checks pass → result.passed = true
   - One check fails → result.passed = false
   - failedChecks array populated correctly

4. **Check Execution**
   - Command timeout works
   - Command failure captured in output
   - Duration measured correctly

### Integration Test (`test/ai-monitor/verification-integration.test.ts`)

1. **Full Verification Flow**
   - Create test project with build/test scripts
   - Run verification engine
   - Verify all checks execute
   - Verify result accuracy

2. **Integration with AI Monitor**
   - Trigger healing action
   - Verification runs automatically
   - Success/failure recorded correctly
   - Circuit breaker updated

3. **Stale Evidence Detection**
   - Mock stale timestamp
   - Verification rejects evidence
   - New check required

## Success Criteria

- [ ] `VerificationEngine` class implemented with all check types
- [ ] Evidence freshness validation works (<5 min TTL)
- [ ] Integration with AI Monitor healing flow complete
- [ ] Unit tests pass (10+ tests)
- [ ] Integration test passes
- [ ] No type errors (`bun run type-check` or `tsc --noEmit`)
- [ ] Documentation added to `ARCHITECTURE.md`

## Non-Goals

- Not implementing custom check plugins (fixed set of check types for v1)
- Not supporting parallel check execution (sequential for v1)
- Not implementing check result caching (always fresh)
- Not adding UI/dashboard for verification results

## References

- Task registry: `.specs/tasks/tasks.json` (AI-MONITOR-001f entry)
- Types: `src/ai-monitor/types.ts` (VerificationEvidence interface already exists)
- Circuit breaker: `src/ai-monitor/circuit-breaker.ts`
- AI Monitor: `src/ai-monitor/index.ts`
