# Model Testing Guide

Test OpenCode models and keep only the ones that actually work.

## Quick Start

**Recommended**: Use the parallel version for fastest results:

```bash
# Test with 10 parallel jobs (takes ~12 minutes for 422 models)
./test-and-filter-models-parallel.sh

# Faster - 20 parallel jobs (takes ~6 minutes)
./test-and-filter-models-parallel.sh --jobs 20

# Dry run first (recommended)
./test-and-filter-models-parallel.sh --dry-run
```

## Available Scripts

### 1. `test-and-filter-models-parallel.sh` ⚡ (RECOMMENDED)

**Fastest option** - Tests models concurrently

```bash
# Dry run with default settings (10 jobs)
./test-and-filter-models-parallel.sh --dry-run

# Test with custom parallelism
./test-and-filter-models-parallel.sh --jobs 20

# Full run (will prompt before modifying files)
./test-and-filter-models-parallel.sh
```

**Timing**:
- 10 jobs: ~12-15 minutes for 422 models
- 20 jobs: ~6-8 minutes for 422 models
- 30 jobs: ~4-5 minutes for 422 models (may hit rate limits)

**Requirements**:
- Works out of the box on macOS/Linux
- Optional: Install GNU parallel for better progress bars
  ```bash
  brew install parallel  # macOS
  apt-get install parallel  # Linux
  ```

### 2. `test-and-filter-models.sh` 🐌

**Sequential version** - Tests one at a time (very slow)

```bash
# Not recommended unless you have issues with parallel execution
./test-and-filter-models.sh --dry-run
```

**Timing**: ~3.5 hours for 422 models

### 3. `test-models.sh` 🔬

**Sample test** - Tests only a small subset (14 models)

```bash
./test-models.sh
```

**Timing**: ~7 minutes

## What Happens

1. **Tests each model**: Runs `opencode run --model <id> "return 'ok'"`
2. **Logs results**: Creates `.loopwork/model-test-*-results.log`
3. **Creates filtered file**: `.loopwork/models-working.json` (only working models)
4. **Shows statistics**: Working models grouped by provider
5. **Offers to update**: Backs up original, replaces with filtered version

## Files Generated

| File | Description |
|------|-------------|
| `.loopwork/models-working.json` | Filtered JSON with only working models |
| `.loopwork/model-test-*-results.log` | Full test results (pass/fail for each) |
| `.loopwork/models.json.backup` | Backup of original (created if you choose to replace) |

## Results from Initial Sample Test

From testing 14 representative models:

**Working (7/14)** ✅
- `google/antigravity-gemini-3-flash`
- `google/antigravity-claude-sonnet-4-5`
- `google/gemini-2.5-flash`
- `openrouter/deepseek/deepseek-v3-base:free`
- `cerebras/gpt-oss-120b`
- `anthropic/claude-sonnet-4-5`
- `zai-coding-plan/glm-4.7`

**Failed (7/14)** ❌
- `google/gemini-2.5-pro` (possibly rate limited)
- `github-copilot/*` models (auth issues?)
- `openrouter/anthropic/*` (config issues?)
- `opencode/*` branded models (not available?)

## Safety Features

- ✅ **Dry run mode**: Test without modifying anything
- ✅ **Automatic backup**: Creates `.backup` before replacing
- ✅ **User confirmation**: Prompts before modifying `models.json`
- ✅ **Restore command**: Easy to revert if needed

## Example Workflow

```bash
# 1. Test in dry-run mode first
./test-and-filter-models-parallel.sh --dry-run --jobs 20

# 2. Review the filtered results
cat .loopwork/models-working.json | jq '.models | length'
cat .loopwork/model-test-parallel-results.log

# 3. If satisfied, run for real
./test-and-filter-models-parallel.sh --jobs 20
# Answer 'y' when prompted

# 4. Verify the updated file
cat .loopwork/models.json | jq '.models | length'
```

## Restoring Original

If you need to restore the original models:

```bash
cp .loopwork/models.json.backup .loopwork/models.json
```

## Troubleshooting

**Rate Limits**: Some providers may rate limit. If you see many failures:
- Reduce `--jobs` (try 5 or 10)
- Re-run the test (failed models may work on retry)

**Timeouts**: Default timeout is 30s per model
- Edit the script and change `TIMEOUT=30` if needed

**Auth Errors**: Some models require authentication
- Check `opencode auth status`
- Models requiring auth will fail but won't break the script
