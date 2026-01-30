# AI-MONITOR-001g: AI Monitor: Wisdom System (Learn from Healing)

## Goal
Store learned error patterns in .loopwork/ai-monitor/. Track what fixes work, accumulate wisdom across sessions, expire old patterns after 30 days.

## Requirements

### Storage
- Store patterns in `.loopwork/ai-monitor/wisdom.json`
- Structure: `{ patterns: [...], lastUpdated: timestamp }`

### Pattern Tracking
- Record error signature (regex or hash)
- Record successful fix action
- Track success count and timestamps
- Include context (file types, error types)

### Wisdom Lifecycle
- Load wisdom on AI Monitor startup
- Update after each successful healing
- Expire patterns older than 30 days on load
- Merge patterns from multiple sessions

### Pattern Schema
```typescript
interface WisdomPattern {
  id: string
  errorSignature: string
  fixAction: string
  successCount: number
  firstSeen: string  // ISO timestamp
  lastSeen: string   // ISO timestamp
  context?: {
    fileTypes?: string[]
    errorTypes?: string[]
  }
}
```

## Success Criteria
- [ ] Wisdom file created/loaded on startup
- [ ] Patterns saved after successful healing
- [ ] Old patterns (>30 days) automatically expired
- [ ] Patterns reused for faster healing on repeat errors
