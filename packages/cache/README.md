# @loopwork-ai/cache-manager

Semantic caching for Loopwork with multi-tier storage and fuzzy matching.

## Overview

This package provides an extensible semantic caching system for the Loopwork framework. It's designed to reduce AI API costs by 20-40% through intelligent caching of AI model outputs with fuzzy matching for similar prompts.

## Features

- **Semantic Caching**: Hash-based key generation with normalization
- **Fuzzy Matching**: Levenshtein similarity for near-duplicate prompts
- **Multi-tier Storage**: Fast L1 (memory) + Persistent L2 (disk)
- **TTL Management**: Automatic expiration of stale entries
- **LRU Eviction**: Intelligent cache replacement policy
- **Pattern Invalidation**: Glob-based cache clearing
- **Statistics Tracking**: Hit rate, evictions, cost savings
- **DI Architecture**: Fully testable with dependency injection

## Installation

```bash
bun add @loopwork-ai/cache-manager
```

## Quick Start

### Basic Usage

```typescript
import { createCacheManager } from '@loopwork-ai/cache-manager';

const cache = createCacheManager({
  maxSize: 1000,
  ttlMs: 3600000, // 1 hour
});

// Cache a result
await cache.set('What is 2+2?', '4');

// Retrieve cached result
const result = await cache.get('What is 2+2?'); // '4'

// Get statistics
const stats = await cache.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);
```

### With Fuzzy Matching

```typescript
const cache = createCacheManager({
  maxSize: 1000,
  fuzzyMatch: true,
  fuzzyThreshold: 0.85,
});

await cache.set('What is two plus two?', '4');

// Similar prompt matches
const result = await cache.get('what is 2 + 2'); // '4' (fuzzy match)
```

### Multi-tier Cache (L1 + L2)

```typescript
const cache = createCacheManager({
  maxSize: 100,          // L1 size
  enableL2: true,
  l2Path: '.cache/ai',   // L2 persistent storage
  ttlMs: 86400000,       // 24 hours
});

// Writes to both L1 and L2
await cache.set('prompt', 'result');

// L1 miss promotes from L2
const result = await cache.get('prompt');
```

## API Reference

### CacheManager<T>

Main cache interface.

#### Methods

##### get(prompt: string): Promise<T | null>

Retrieves cached result for a prompt.

- Checks L1 (memory) first
- Falls back to L2 (disk) if enabled
- Returns null on cache miss
- Updates lastAccessedAt for LRU

##### set(prompt: string, value: T, ttlMs?: number): Promise<void>

Caches a result.

- Generates semantic hash key
- Writes to L1 and L2 (if enabled)
- Triggers eviction if maxSize reached
- Custom TTL overrides default

##### invalidate(pattern: string): Promise<number>

Invalidates entries matching glob pattern.

- Returns count of removed entries
- Supports wildcards: `user:*`, `cache:*:data`

##### clear(): Promise<void>

Removes all cached entries and resets statistics.

##### getStats(): Promise<CacheStats>

Returns current performance statistics.

### CacheConfig

Configuration options:

```typescript
interface CacheConfig {
  maxSize?: number;           // Max entries (default: 1000)
  ttlMs?: number;             // TTL in ms (default: 3600000)
  enableL2?: boolean;         // Enable disk cache (default: false)
  l2Path?: string;            // L2 directory path
  fuzzyMatch?: boolean;       // Enable similarity matching (default: false)
  fuzzyThreshold?: number;    // Similarity 0-1 (default: 0.85)
  evictionPolicy?: 'lru';     // Only LRU supported currently
}
```

### CacheStats

Performance metrics:

```typescript
interface CacheStats {
  hits: number;       // Total cache hits
  misses: number;     // Total cache misses
  hitRate: number;    // Hit rate percentage (0-100)
  size: number;       // Current entry count
  evictions: number;  // Total evictions performed
  savings?: number;   // Cost savings (optional)
}
```

## Loopwork Integration

Use the plugin in your `loopwork.config.ts`:

```typescript
import { compose, defineConfig } from '@loopwork-ai/loopwork';
import { withCacheManager } from '@loopwork-ai/cache-manager';

export default compose(
  withCacheManager({
    maxSize: 500,
    ttlMs: 7200000,      // 2 hours
    enableL2: true,
    l2Path: '.cache/ai',
    fuzzyMatch: true,
    fuzzyThreshold: 0.9,
    reportStats: true,   // Log stats after each loop
  })
)(defineConfig({
  // ... other config
}));
```

## Advanced Usage

### Pattern-based Invalidation

```typescript
// Cache with namespaces
await cache.set('user:123:profile', userData);
await cache.set('user:123:settings', userSettings);
await cache.set('user:456:profile', otherUserData);

// Invalidate all user:123 entries
await cache.invalidate('user:123:*'); // Removes 2 entries
```

### Custom TTL per Entry

```typescript
const cache = createCacheManager({ ttlMs: 3600000 }); // Default 1 hour

// Short-lived cache (5 minutes)
await cache.set('volatile-data', result, 300000);

// Long-lived cache (24 hours)
await cache.set('stable-data', result, 86400000);
```

### Monitoring Cache Performance

```typescript
const stats = await cache.getStats();

console.log({
  hitRate: `${stats.hitRate.toFixed(2)}%`,
  efficiency: `${stats.hits} hits / ${stats.misses} misses`,
  size: `${stats.size} / ${config.maxSize}`,
  evictions: stats.evictions,
});
```

## Architecture

### Dependency Injection

All components use constructor injection for testability:

```typescript
import {
  createCacheKey,
  createTTLManager,
  createLRUPolicy,
  createMemoryStore,
  createFileStore,
} from '@loopwork-ai/cache-manager';

// Custom cache with injected dependencies
const cache = new CacheManagerImpl(
  config,
  createMemoryStore(),
  createCacheKey(),
  createTTLManager(),
  createLRUPolicy(),
  { now: () => Date.now() },
  createFileStore('.cache')
);
```

### Standalone Package

This package has **zero dependencies** on Loopwork core (except `plugin.ts`). Use it in any TypeScript project:

```typescript
import { createCacheManager } from '@loopwork-ai/cache-manager';

// Works anywhere, not just Loopwork
const cache = createCacheManager({ maxSize: 100 });
```

## Performance

- **Key generation**: <1ms (SHA-256 hashing)
- **Memory cache**: O(1) get/set
- **File cache**: O(1) with filesystem overhead
- **Fuzzy matching**: O(n*m) Levenshtein, acceptable for <1000 char prompts
- **Eviction**: O(n) where n = cache size

## Design Decisions

### Why SHA-256 for keys?
- Collision-resistant
- Deterministic
- Fast for typical prompts

### Why Levenshtein for similarity?
- Simple, well-understood algorithm
- Good for typos and minor variations
- No external dependencies

### Why LRU eviction?
- Temporal locality: recent = likely to be reused
- Simple to implement
- Predictable behavior

## Limitations

- File store `keys()` returns empty array (keys are hashed)
- Fuzzy matching is O(n) - scales linearly with cache size
- No compression or encryption (yet)

## Examples

See `examples/` directory for:
- Basic caching patterns
- Loopwork integration
- Custom configurations
- Performance benchmarks

## License

MIT

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md)
