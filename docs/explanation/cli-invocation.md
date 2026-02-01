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

## Resource Isolation (Bulkhead Pattern)

Loopwork implements the Bulkhead pattern to isolate resources between different types of tasks. Each task is assigned to a worker pool based on its priority or feature.

### Worker Pools

Default pools configured in `CliExecutor`:

| Pool | Size | Nice (CPU) | Memory Limit |
|------|------|------------|--------------|
| `high` | 2 | 0 | 2048 MB |
| `medium` | 5 | 5 | 1024 MB |
| `low` | 2 | 10 | 512 MB |
| `background` | 1 | 15 | 256 MB |

### Resource Limits Enforcement

1. **CPU Priority**: Applied via `nice` command on Unix systems during process spawn.
2. **Memory Monitoring**: `ProcessResourceMonitor` polls RSS memory usage of child processes.
3. **Termination**: If a process exceeds its pool's `memoryLimitMB`, it is terminated with `SIGKILL` and the task fails with `ERR_RESOURCE_EXHAUSTED`.

## Source Code

See `packages/loopwork/src/core/cli.ts` and `packages/loopwork/src/core/isolation/WorkerPoolManager.ts` for implementation.

## Using Presets

Instead of manually configuring model pools, you can use `ModelPresets` and `RetryPresets` for common configurations.

### Model Presets

Available via `ModelPresets` object:

| Preset | Description | Model |
|--------|-------------|-------|
| `claudeSonnet` | Balanced | Claude 3.5 Sonnet |
| `claudeOpus` | High Capability | Claude 3 Opus |
| `claudeHaiku` | Fast/Cheap | Claude 3 Haiku |
| `geminiFlash` | Fast | Gemini 1.5 Flash |
| `geminiPro` | Capable | Gemini 1.5 Pro |

### Capability Levels

Abstracted capability levels that map to best available models:

- `capabilityHigh()`: Maps to Opus
- `capabilityMedium()`: Maps to Sonnet
- `capabilityLow()`: Maps to Haiku

### Roles

Role-based configuration for semantic clarity:

- `roleArchitect()`: High capability (Opus)
- `roleEngineer()`: Medium capability (Sonnet)
- `roleJunior()`: Low capability (Haiku)

### Retry Presets

Available via `RetryPresets` object:

- `default()`: Fixed 60s wait on rate limit, no exponential backoff.
- `aggressive()`: Exponential backoff, retries same model up to 3 times.
- `gentle()`: Long 120s wait on rate limit, no retries on same model.

