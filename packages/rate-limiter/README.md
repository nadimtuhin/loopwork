# @loopwork-ai/rate-limiter

Foundational rate limiting for Loopwork with Dependency Injection (DI) architecture.

## Overview

This package provides a standalone, extensible rate limiting system designed for the Loopwork task automation framework. It uses a dependency inversion approach to ensure all components are mockable and testable. It combines multiple algorithms (Token Bucket and Sliding Window) to provide robust rate limiting that handles both bursts and sustained traffic.

## Features

- **Hybrid Rate Limiting**: Combines Token Bucket (for burst capacity) and Sliding Window (for sustained rates).
- **Smart Detector**: Intelligent decision making with multiple backoff strategies (Exponential, Linear, Adaptive).
- **Pluggable Storage**: Support for Memory and File-based storage out of the box.
- **Provider Management**: Pre-configured limits for major AI providers (Claude, OpenAI, Gemini).
- **DI Architecture**: Built for testability with clean interfaces and dependency injection.
- **Loopwork Plugin**: Seamless integration with the Loopwork core framework.

## Installation

```bash
bun add @loopwork-ai/rate-limiter
```

## Quick Start

### Basic Usage with Provider Manager

The `ProviderManager` is the easiest way to manage limits for multiple services:

```typescript
import { createProviderManager } from '@loopwork-ai/rate-limiter';

const manager = createProviderManager();

// Add a provider with custom limits
manager.addProvider('my-service', {
  requestsPerMinute: 60,
  tokensPerMinute: 60000 // Currently used for metadata
});

// Check if a request is allowed
const decision = manager.checkLimit('my-service');

if (decision.allowed) {
  // Proceed with request
  console.log(`Usage: ${decision.currentUsage}/${decision.limit}`);
} else {
  console.log(`Rate limited! Retry after ${decision.retryAfter}s`);
}
```

### Using Algorithms Directly

```typescript
import { createTokenBucket, createSlidingWindow } from '@loopwork-ai/rate-limiter';

const bucket = createTokenBucket({
  capacity: 10,
  refillRate: 1 // 1 token per second
});

if (bucket.consume(1)) {
  // Success
}

const window = createSlidingWindow({
  limit: 50,
  windowMs: 60000 // 1 minute
});

if (window.allow()) {
  // Success
}
```

## API Reference

### Token Bucket

The Token Bucket algorithm allows for bursts of traffic up to a maximum capacity while maintaining a steady refill rate.

- `createTokenBucket(config: TokenBucketConfig, timeSource?: TimeSource): TokenBucket`
- **Config**:
  - `capacity`: Maximum number of tokens in the bucket.
  - `refillRate`: Rate at which tokens are added (tokens per second).

### Sliding Window

The Sliding Window algorithm tracks the exact number of requests within a moving time window.

- `createSlidingWindow(config: SlidingWindowConfig, timeSource?: TimeSource): SlidingWindow`
- **Config**:
  - `limit`: Maximum requests allowed in the window.
  - `windowMs`: Duration of the window in milliseconds.

### Rate Limit Detector

Combines algorithms and handles backoff logic.

- `createRateLimitDetector(tokenBucket, slidingWindow, config: DetectorConfig): RateLimitDetector`
- **Config**:
  - `threshold`: Percentage (0.0-1.0) to flag approaching limit. Default: `0.8`.
  - `backoffStrategy`: `exponential` | `linear` | `adaptive`. Default: `exponential`.
  - `baseDelay`: Base delay for backoff calculation. Default: `1000`.

### Storage Providers

- `createMemoryStorage()`: Volatile in-memory storage for testing or short-lived processes.
- `createFileStorage(filePath: string)`: Persistent file-based storage.

### Provider Manager

Central registry for managing multiple rate-limited entities.

- `createProviderManager()`: Creates a new manager instance.
- `addProvider(name, limits, detectorConfig?)`: Register a provider.
- `checkLimit(name)`: Get a decision for a provider.

## Configuration

### Pre-defined Limits

The package includes default limits for common AI providers:

```typescript
import { CLAUDE_LIMITS, OPENAI_LIMITS, GEMINI_LIMITS } from '@loopwork-ai/rate-limiter';

// CLAUDE: 50 RPM, 40k TPM
// OPENAI: 60 RPM, 60k TPM
// GEMINI: 15 RPM, 32k TPM
```

## Loopwork Integration

Use the plugin in your `loopwork.config.ts`:

```typescript
import { withRateLimiter } from '@loopwork-ai/rate-limiter';
import { compose, defineConfig } from '@loopwork-ai/loopwork';

export default compose(
  withRateLimiter({
    // Optional configuration
  })
)(defineConfig({
  // ...
}));
```

## Principles

1. **Dependency Inversion**: All components depend on interfaces, not implementations.
2. **Constructor Injection**: Dependencies are passed via constructors to facilitate testing.
3. **Single Responsibility**: Each component has a single, clear purpose.
4. **Standalone**: No dependencies on the Loopwork core package.

## License

MIT
