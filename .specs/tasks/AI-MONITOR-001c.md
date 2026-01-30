# AI-MONITOR-001c: AI Monitor: Circuit Breaker

## Goal
Implement circuit breaker pattern (closed/open/half-open states). 3 failures → 60s cooldown. Prevents infinite healing loops.

## Requirements

### States
- **Closed**: Normal operation, healing allowed
- **Open**: Too many failures, healing blocked
- **Half-Open**: Testing if healing can resume

### Thresholds
- 3 consecutive failures → open circuit
- 60s cooldown before half-open
- 1 success in half-open → close circuit

### API
```typescript
interface CircuitBreaker {
  canHeal(): boolean
  recordSuccess(): void
  recordFailure(): void
  getState(): 'closed' | 'open' | 'half-open'
}
```

## Success Criteria
- [ ] Circuit opens after 3 failures
- [ ] 60s cooldown enforced
- [ ] Recovery to closed state works
