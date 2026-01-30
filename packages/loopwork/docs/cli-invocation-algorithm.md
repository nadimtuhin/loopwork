# CLI Invocation Algorithm

This document describes how loopwork selects and invokes AI CLI tools.

## Model Pools

### Primary Pool (EXEC_MODELS)

| Order | CLI | Model | Display Name |
|-------|-----|-------|--------------|
| 1 | `claude` | sonnet | claude |
| 2 | `opencode` | google/antigravity-claude-sonnet-4-5 | sonnet |
| 3 | `opencode` | google/antigravity-gemini-3-flash | gemini-flash |

### Fallback Pool (FALLBACK_MODELS)

| Order | CLI | Model | Display Name |
|-------|-----|-------|--------------|
| 4 | `claude` | opus | opus |
| 5 | `opencode` | google/antigravity-gemini-3-pro | gemini-pro |

## Invocation Flow

```
┌─────────────────────────────────────────────────────────┐
│  Start: attempt = 0, execIndex = 0, useFallback = false │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Get next model from pool (round-robin)                 │
│  Primary: EXEC_MODELS[execIndex % 3]                    │
│  Fallback: FALLBACK_MODELS[fallbackIndex % 2]           │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Execute CLI with timeout                               │
└─────────────────────────┬───────────────────────────────┘
                          ▼
              ┌───────────┴───────────┐
              │     Check Result      │
              └───────────┬───────────┘
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   [Success]         [Rate Limit]      [Timeout/Error]
   exit code 0       wait 30s          try next model
        │             continue              │
        ▼                 │                 ▼
     DONE ◄───────────────┴────► Switch to fallback
                                 after exhausting primary
```

## Retry Logic

| Condition | Action |
|-----------|--------|
| Exit code 0 | Success, return |
| Timeout | Log, try next model |
| Rate limit (429, RESOURCE_EXHAUSTED) | Wait 30s, retry same pool |
| Quota exhausted (billing limit) | Switch to fallback models |
| All 5 models fail | Throw LoopworkError |

## Configuration

### Max Attempts

Total: **5** (3 primary + 2 fallback)

### Timeouts

- Default timeout: Configured in `loopwork.config.ts`
- Rate limit wait: 30 seconds (`RATE_LIMIT_WAIT_MS`)
- SIGKILL delay: After SIGTERM, wait before SIGKILL (`SIGKILL_DELAY_MS`)

### Rate Limit Detection

Patterns matched in CLI output (last 2000 chars):
- `rate.*limit`
- `too.*many.*request`
- `429`
- `RESOURCE_EXHAUSTED`

### Quota Exhaustion Detection

Patterns matched:
- `quota.*exceed`
- `billing.*limit`

## CLI Detection

On startup, `CliExecutor` detects available CLIs:

1. Check PATH via `which` command
2. Check known locations:
   - **opencode**: `~/.opencode/bin/opencode`, `/usr/local/bin/opencode`
   - **claude**: `~/.nvm/versions/node/*/bin/claude`, `/usr/local/bin/claude`, `~/.npm/bin/claude`

## CLI Execution Details

### Claude CLI

```bash
claude -p --dangerously-skip-permissions --model <model>
# Prompt sent via stdin
```

### OpenCode CLI

```bash
OPENCODE_PERMISSION='{"*":"allow"}' opencode run --model <model> "<prompt>"
# Prompt passed as argument
```

## Source Code

See `packages/loopwork/src/core/cli.ts` for implementation.
