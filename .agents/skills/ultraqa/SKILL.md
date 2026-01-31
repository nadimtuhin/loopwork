---
name: ultraqa
description: Ultra QA - Comprehensive quality assurance and testing skill for software development
metadata:
  tags: qa, testing, quality, verification, bugs, test-automation, coverage
---

## When to use

Invoke `/ultraqa` when:
- Verifying a feature implementation is complete
- Before marking a task as "done"
- Running comprehensive test suites
- Checking for regressions
- Validating edge cases
- Performing code quality checks

## QA Checklist

### 1. Unit Tests

- [ ] All new code has unit tests
- [ ] Tests follow Arrange-Act-Assert pattern
- [ ] Each test has a single assertion focus
- [ ] Edge cases are covered
- [ ] Error scenarios have tests
- [ ] Tests are isolated (no shared state)
- [ ] Mock external dependencies

### 2. Integration Tests

- [ ] Components work together
- [ ] Full data flow is tested
- [ ] Config propagation verified
- [ ] Plugin hooks work end-to-end
- [ ] Backend operations tested
- [ ] State persistence verified

### 3. E2E Tests

- [ ] User journey scenarios pass
- [ ] CLI commands work correctly
- [ ] File operations verified
- [ ] Error handling graceful

### 4. Code Quality

- [ ] No lint errors
- [ ] TypeScript compiles without errors
- [ ] No `any` types unless unavoidable
- [ ] Cyclomatic complexity acceptable
- [ ] Functions are small and focused
- [ ] No code duplication

### 5. Security Checks

- [ ] No secrets in code
- [ ] Input validation present
- [ ] SQL/command injection prevention
- [ ] Authentication/authorization verified
- [ ] Sensitive data not logged

## Quick Commands

```bash
# Run all tests
bun run test

# Run specific package tests
bun --cwd packages/loopwork test

# Type check
bun tsc --noEmit

# Lint check
bun run lint

# E2E tests
bun test e2e

# Coverage report
bun test --coverage

# Specific test file
bun test path/to/test.test.ts
```

## Test Patterns

### Arrange-Act-Assert Template

```typescript
test('should do X when Y', () => {
  // Arrange
  const input = setupTestData()
  const mock = mockDependency()

  // Act
  const result = subject(input)

  // Assert
  expect(result).toEqual(expected)
  expect(mock).toHaveBeenCalledWith(expected)
})
```

### Error Handling Test

```typescript
test('should throw when input is invalid', () => {
  expect(() => subject(invalidInput)).toThrow(ValidationError)
})
```

### Async Test

```typescript
test('should resolve with data', async () => {
  const result = await subject(request)
  expect(result).toHaveProperty('data')
})
```

## Bug Verification

When fixing a bug:
- [ ] Add regression test
- [ ] Verify fix doesn't break other tests
- [ ] Check similar code for same issue
- [ ] Document root cause
- [ ] Add to integration checklist

## Coverage Requirements

| Type | Minimum |
|------|---------|
| Lines | 80% |
| Functions | 90% |
| Branches | 75% |
| Statements | 80% |

## Quality Gates

Before marking complete, verify:

1. ✅ All tests pass
2. ✅ TypeScript compiles clean
3. ✅ No lint warnings
4. ✅ Build succeeds
5. ✅ E2E tests pass
6. ✅ Coverage meets threshold
7. ✅ No security vulnerabilities
8. ✅ Documentation updated
