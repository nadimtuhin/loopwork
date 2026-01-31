# OpenCode Models - Complete Reference

All tested and working OpenCode models organized by provider.
Use `createModel()` helper with: name, cli, model, timeout, costWeight

## Google Antigravity Models (Premium Google Infrastructure)

```typescript
createModel({ name: "antigravity-claude-opus-4-5-thinking", cli: "opencode", model: "google/antigravity-claude-opus-4-5-thinking", timeout: 600, costWeight: 80 }),
createModel({ name: "antigravity-claude-sonnet-4-5", cli: "opencode", model: "google/antigravity-claude-sonnet-4-5", timeout: 300, costWeight: 30 }),
createModel({ name: "antigravity-gemini-3-flash", cli: "opencode", model: "google/antigravity-gemini-3-flash", timeout: 180, costWeight: 15 }),
createModel({ name: "antigravity-gemini-3-pro-high", cli: "opencode", model: "google/antigravity-gemini-3-pro-high", timeout: 600, costWeight: 60 }),
createModel({ name: "antigravity-gemini-3-pro-low", cli: "opencode", model: "google/antigravity-gemini-3-pro-low", timeout: 600, costWeight: 50 }),
```

## Google Gemini Models (Direct Google API)

### Gemini 1.5 Series
```typescript
createModel({ name: "gemini-1.5-flash", cli: "opencode", model: "google/gemini-1.5-flash", timeout: 180, costWeight: 15 }),
createModel({ name: "gemini-1.5-flash-8b", cli: "opencode", model: "google/gemini-1.5-flash-8b", timeout: 120, costWeight: 10 }),
createModel({ name: "gemini-1.5-pro", cli: "opencode", model: "google/gemini-1.5-pro", timeout: 600, costWeight: 60 }),
```

### Gemini 2.0 Series
```typescript
createModel({ name: "gemini-2.0-flash", cli: "opencode", model: "google/gemini-2.0-flash", timeout: 180, costWeight: 18 }),
createModel({ name: "gemini-2.0-flash-lite", cli: "opencode", model: "google/gemini-2.0-flash-lite", timeout: 120, costWeight: 12 }),
```

### Gemini 2.5 Series (Latest Stable)
```typescript
createModel({ name: "gemini-2.5-flash", cli: "opencode", model: "google/gemini-2.5-flash", timeout: 180, costWeight: 20 }),
createModel({ name: "gemini-2.5-flash-lite", cli: "opencode", model: "google/gemini-2.5-flash-lite", timeout: 120, costWeight: 15 }),
createModel({ name: "gemini-2.5-flash-image", cli: "opencode", model: "google/gemini-2.5-flash-image", timeout: 180, costWeight: 22 }),
createModel({ name: "gemini-2.5-pro", cli: "opencode", model: "google/gemini-2.5-pro", timeout: 600, costWeight: 70 }),
```

### Gemini 3 Series (Preview)
```typescript
createModel({ name: "gemini-3-flash-preview", cli: "opencode", model: "google/gemini-3-flash-preview", timeout: 180, costWeight: 20 }),
createModel({ name: "gemini-3-pro-preview", cli: "opencode", model: "google/gemini-3-pro-preview", timeout: 600, costWeight: 70 }),
```

## Anthropic Models (Official API)

### Claude 4 Series (Latest)
```typescript
createModel({ name: "claude-opus-4.5", cli: "opencode", model: "anthropic/claude-opus-4-5-20251101", timeout: 900, costWeight: 115 }),
createModel({ name: "claude-opus-4.1", cli: "opencode", model: "anthropic/claude-opus-4-1-20250805", timeout: 900, costWeight: 110 }),
createModel({ name: "claude-sonnet-4.5", cli: "opencode", model: "anthropic/claude-sonnet-4-5-20250929", timeout: 300, costWeight: 35 }),
createModel({ name: "claude-haiku-4.5", cli: "opencode", model: "anthropic/claude-haiku-4-5-20251001", timeout: 120, costWeight: 12 }),
```

### Claude 3.7 Series
```typescript
createModel({ name: "claude-3.7-sonnet", cli: "opencode", model: "anthropic/claude-3-7-sonnet-20250219", timeout: 300, costWeight: 38 }),
```

### Claude 3.5 Series
```typescript
createModel({ name: "claude-3.5-sonnet", cli: "opencode", model: "anthropic/claude-3-5-sonnet-20241022", timeout: 300, costWeight: 35 }),
createModel({ name: "claude-3.5-haiku", cli: "opencode", model: "anthropic/claude-3-5-haiku-20241022", timeout: 120, costWeight: 12 }),
```

## GitHub Copilot Models (Enterprise Access)

### Claude via Copilot
```typescript
createModel({ name: "copilot-claude-opus-4.5", cli: "opencode", model: "github-copilot/claude-opus-4.5", timeout: 900, costWeight: 100 }),
createModel({ name: "copilot-claude-sonnet-4.5", cli: "opencode", model: "github-copilot/claude-sonnet-4.5", timeout: 300, costWeight: 30 }),
createModel({ name: "copilot-claude-haiku-4.5", cli: "opencode", model: "github-copilot/claude-haiku-4.5", timeout: 120, costWeight: 10 }),
```

### GPT via Copilot
```typescript
createModel({ name: "copilot-gpt-5", cli: "opencode", model: "github-copilot/gpt-5", timeout: 600, costWeight: 80 }),
createModel({ name: "copilot-gpt-5.1-codex", cli: "opencode", model: "github-copilot/gpt-5.1-codex", timeout: 600, costWeight: 90 }),
createModel({ name: "copilot-gpt-5.1-codex-max", cli: "opencode", model: "github-copilot/gpt-5.1-codex-max", timeout: 900, costWeight: 95 }),
createModel({ name: "copilot-gpt-5.2-codex", cli: "opencode", model: "github-copilot/gpt-5.2-codex", timeout: 600, costWeight: 92 }),
```

## OpenCode Native Models

```typescript
createModel({ name: "opencode-claude-opus-4.5", cli: "opencode", model: "opencode/claude-opus-4-5", timeout: 900, costWeight: 100 }),
createModel({ name: "opencode-claude-sonnet-4.5", cli: "opencode", model: "opencode/claude-sonnet-4-5", timeout: 300, costWeight: 30 }),
createModel({ name: "opencode-gemini-3-pro", cli: "opencode", model: "opencode/gemini-3-pro", timeout: 600, costWeight: 70 }),
createModel({ name: "opencode-gpt-5.1-codex", cli: "opencode", model: "opencode/gpt-5.1-codex", timeout: 600, costWeight: 90 }),
```

## DeepSeek Models (Chinese AI - Code Specialist)

```typescript
createModel({ name: "deepseek-v3.2", cli: "opencode", model: "openrouter/deepseek/deepseek-v3.2", timeout: 600, costWeight: 40 }),
createModel({ name: "deepseek-chat-v3.1", cli: "opencode", model: "openrouter/deepseek/deepseek-chat-v3.1", timeout: 300, costWeight: 25 }),
createModel({ name: "deepseek-r1", cli: "opencode", model: "openrouter/deepseek/deepseek-r1:free", timeout: 600, costWeight: 5 }),
createModel({ name: "deepseek-r1-distill-llama-70b", cli: "opencode", model: "openrouter/deepseek/deepseek-r1-distill-llama-70b", timeout: 600, costWeight: 35 }),
```

## Qwen Models (Alibaba - Multilingual)

```typescript
createModel({ name: "qwen3-coder", cli: "opencode", model: "opencode/qwen3-coder", timeout: 300, costWeight: 30 }),
createModel({ name: "qwen3-coder-flash", cli: "opencode", model: "openrouter/qwen/qwen3-coder-flash", timeout: 180, costWeight: 15 }),
createModel({ name: "qwen3-235b-a22b", cli: "opencode", model: "openrouter/qwen/qwen3-235b-a22b-07-25", timeout: 600, costWeight: 50 }),
createModel({ name: "qwen3-max", cli: "opencode", model: "openrouter/qwen/qwen3-max", timeout: 900, costWeight: 75 }),
```

## Kimi Models (Moonshot AI - Long Context)

```typescript
createModel({ name: "kimi-k2.5", cli: "opencode", model: "opencode/kimi-k2.5", timeout: 600, costWeight: 60 }),
createModel({ name: "kimi-k2-thinking", cli: "opencode", model: "opencode/kimi-k2-thinking", timeout: 900, costWeight: 80 }),
createModel({ name: "kimi-k2", cli: "opencode", model: "opencode/kimi-k2", timeout: 600, costWeight: 55 }),
```

## GLM Models (Zhipu AI - Chinese)

```typescript
createModel({ name: "glm-4.7", cli: "opencode", model: "opencode/glm-4.7", timeout: 600, costWeight: 50 }),
createModel({ name: "glm-4.7-free", cli: "opencode", model: "opencode/glm-4.7-free", timeout: 600, costWeight: 5 }),
createModel({ name: "glm-4.6", cli: "opencode", model: "opencode/glm-4.6", timeout: 600, costWeight: 45 }),
```

## Mistral/Devstral Models (European AI)

```typescript
createModel({ name: "devstral-2512", cli: "opencode", model: "openrouter/mistralai/devstral-2512", timeout: 600, costWeight: 40 }),
createModel({ name: "codestral-2508", cli: "opencode", model: "openrouter/mistralai/codestral-2508", timeout: 600, costWeight: 35 }),
createModel({ name: "devstral-medium-2507", cli: "opencode", model: "openrouter/mistralai/devstral-medium-2507", timeout: 600, costWeight: 45 }),
```

## Grok Models (xAI - Code Specialist)

```typescript
createModel({ name: "grok-4-fast", cli: "opencode", model: "openrouter/x-ai/grok-4-fast", timeout: 300, costWeight: 50 }),
createModel({ name: "grok-code-fast-1", cli: "opencode", model: "openrouter/x-ai/grok-code-fast-1", timeout: 300, costWeight: 45 }),
createModel({ name: "grok-4", cli: "opencode", model: "openrouter/x-ai/grok-4", timeout: 600, costWeight: 70 }),
```

## Minimax Models (Chinese Multimodal)

```typescript
createModel({ name: "minimax-m2.1", cli: "opencode", model: "opencode/minimax-m2.1", timeout: 600, costWeight: 55 }),
createModel({ name: "minimax-m2.1-free", cli: "opencode", model: "opencode/minimax-m2.1-free", timeout: 600, costWeight: 5 }),
```

## Free Tier Models (Budget-Friendly)

```typescript
// Best for reasoning
createModel({ name: "deepseek-r1", cli: "opencode", model: "openrouter/deepseek/deepseek-r1:free", timeout: 600, costWeight: 5 }),

// Best for general use
createModel({ name: "llama-3.3-70b", cli: "opencode", model: "openrouter/meta-llama/llama-3.3-70b-instruct:free", timeout: 600, costWeight: 5 }),

// Best for coding
createModel({ name: "qwen3-coder", cli: "opencode", model: "openrouter/qwen/qwen3-coder:free", timeout: 300, costWeight: 5 }),

// Balanced
createModel({ name: "gemma-3-27b", cli: "opencode", model: "openrouter/google/gemma-3-27b-it:free", timeout: 300, costWeight: 5 }),
```

## Model Selection Guide

### By Speed & Cost (costWeight)
- **Fast & Cheap (5-20)**: gemini-flash, claude-haiku, gpt-5-nano, all :free models
- **Balanced (25-50)**: claude-sonnet, deepseek-v3.2, qwen3-coder, devstral
- **Premium (60-100)**: claude-opus, gpt-5.1-codex-max, kimi-k2-thinking

### By Task Type
- **Code Specialists**: gpt-5.1-codex-max, qwen3-coder, devstral-2512, grok-code-fast-1
- **Long Context (128k+)**: kimi-k2/k2.5 (200k), qwen3-max, deepseek-v3.2
- **Multilingual**: qwen3 models, glm-4.7, kimi-k2.5
- **Reasoning**: deepseek-r1, kimi-k2-thinking, qwen3-235b-thinking

### Recommended Configurations

#### Cost-Optimized Pool
```typescript
models: [
  createModel({ name: "qwen3-coder", cli: "opencode", model: "openrouter/qwen/qwen3-coder:free", timeout: 300, costWeight: 5 }),
  createModel({ name: "deepseek-r1", cli: "opencode", model: "openrouter/deepseek/deepseek-r1:free", timeout: 600, costWeight: 5 }),
  createModel({ name: "gemini-2.5-flash", cli: "opencode", model: "google/gemini-2.5-flash", timeout: 180, costWeight: 20 }),
]
```

#### Balanced Pool
```typescript
models: [
  createModel({ name: "gemini-3-flash", cli: "opencode", model: "google/antigravity-gemini-3-flash", timeout: 180, costWeight: 15 }),
  createModel({ name: "claude-sonnet-4.5", cli: "opencode", model: "anthropic/claude-sonnet-4-5-20250929", timeout: 300, costWeight: 35 }),
  createModel({ name: "qwen3-coder", cli: "opencode", model: "opencode/qwen3-coder", timeout: 300, costWeight: 30 }),
]
```

#### Premium Pool
```typescript
models: [
  createModel({ name: "claude-opus-4.5", cli: "opencode", model: "anthropic/claude-opus-4-5-20251101", timeout: 900, costWeight: 115 }),
  createModel({ name: "gpt-5.1-codex-max", cli: "opencode", model: "github-copilot/gpt-5.1-codex-max", timeout: 900, costWeight: 95 }),
  createModel({ name: "kimi-k2-thinking", cli: "opencode", model: "opencode/kimi-k2-thinking", timeout: 900, costWeight: 80 }),
]
```

## Usage Tips

1. **Start with free models** to test your workflow
2. **Mix tiers** for cost-effective round-robin: fast models for simple tasks, premium for complex
3. **Use cost-aware strategy** to automatically prefer cheaper models
4. **Set appropriate timeouts** based on model speed (flash: 180s, standard: 300-600s, thinking: 900s)
5. **Monitor costs** with the cost-tracking plugin
