# AI-MONITOR-001h: AI Monitor: LLM Fallback Analyzer

## Goal
For unknown errors, send to LLM (haiku) for analysis. Throttle to max 10 calls/session, 5-min cooldown. Cache responses for 24h.

## Requirements

### LLM Integration
- Use Claude Haiku model for cost efficiency
- Send error context + stack trace for analysis
- Request structured response with:
  - Root cause analysis
  - Suggested fix actions
  - Confidence score

### Rate Limiting
- Maximum 10 LLM calls per session
- 5-minute cooldown between consecutive calls
- Track call count in session state
- Log when throttled

### Response Caching
- Cache responses in `.loopwork/ai-monitor/llm-cache.json`
- Cache key: hash of error signature
- Cache expiry: 24 hours
- Check cache before making LLM call

### Cache Schema
```typescript
interface LLMCacheEntry {
  errorHash: string
  analysis: {
    rootCause: string
    suggestedFixes: string[]
    confidence: number
  }
  cachedAt: string  // ISO timestamp
  expiresAt: string // ISO timestamp
}
```

### Error Handling
- Graceful fallback if LLM unavailable
- Log LLM errors but don't crash monitor
- Return null analysis on failure

## Success Criteria
- [ ] Unknown errors analyzed by LLM
- [ ] Rate limiting prevents excessive API calls
- [ ] Responses cached and reused within 24h
- [ ] Session tracks call count
- [ ] Graceful degradation on LLM errors
