# AI Monitor Test Suite

This directory contains the complete test suite for the `@loopwork-ai/ai-monitor` package.

## Test Files

| File | Description | Test Count |
|------|-------------|------------|
| `circuit-breaker.test.ts` | Circuit breaker state transitions, cooldown, reset | ~25 tests |
| `core.test.ts` | LogWatcher, PatternDetector, AIMonitor integration | ~20 tests |
| `create-prd.test.ts` | Auto-create PRD action with task metadata | ~15 tests |
| `llm-analyzer.test.ts` | LLM fallback analyzer, caching, throttling | ~15 tests |
| `task-recovery.test.ts` | Task recovery system, exit reason detection | ~15 tests |
| `verification-integration.test.ts` | Verification engine integration | ~15 tests |
| `wisdom.test.ts` | Wisdom system learning, persistence, expiration | ~45 tests |

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test circuit-breaker.test.ts

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

## Test Structure

All tests follow these patterns:
- Use `describe()` blocks for logical grouping
- Use `beforeEach()` and `afterEach()` for setup/cleanup
- Use unique temp directories per test to avoid conflicts
- Mock external dependencies (backends, file system when needed)
- Test edge cases and error handling

## Import Patterns

Tests import from the package source:
```typescript
// Package exports
import { AIMonitor } from '../src/index'
import { CircuitBreaker } from '../src/circuit-breaker'

// Loopwork core types (external dependency)
import type { LoopworkConfig } from '@loopwork-ai/loopwork/contracts'
import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'
```

## Coverage Goals

- Line coverage: >85%
- Branch coverage: >80%
- Function coverage: >90%
