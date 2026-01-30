# TELE-013: Teleloop: Smart Daily Briefings

## Goal
Generate AI summaries of loop activity (completed tasks, errors, files modified) and send a daily briefing to the user.

## Requirements

### Data Collection
- Track completed tasks per day
- Track errors and failures
- Track files modified (from git or file watcher)
- Aggregate statistics

### AI Summary Generation
- Use LLM to generate human-readable summary
- Include highlights and concerns
- Keep summary concise (<500 words)

### Delivery
- Send via Telegram at configured time
- Support timezone configuration
- Allow manual trigger via command

### Configuration
```typescript
interface DailyBriefingConfig {
  enabled: boolean
  sendTime: string  // "09:00"
  timezone: string  // "America/New_York"
  includeMetrics: boolean
  includeFileChanges: boolean
}
```

## Success Criteria
- [ ] Daily summary generated automatically
- [ ] Sent at configured time
- [ ] Manual trigger works
- [ ] Summary is useful and concise
