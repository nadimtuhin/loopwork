# @loopwork-ai/rate-limiter

Foundational rate limiting for Loopwork with Dependency Injection (DI) architecture.

## Overview

This package provides a standalone, extensible rate limiting system designed for the Loopwork task automation framework. It uses a dependency inversion approach to ensure all components are mockable and testable.

## Architecture

The package is built on several key abstractions:

- **RateLimiter**: The primary interface for checking and recording rate limits.
- **RateLimitStorage**: Abstraction for state persistence (e.g., memory, Redis, File).
- **Algorithms**: Interfaces for common rate limiting algorithms:
  - **TokenBucket**: For burstable rate limiting.
  - **SlidingWindow**: For smooth rate limiting across time windows.

## Package Structure

```
packages/rate-limiter/
├── src/
│   ├── interfaces/       # All contracts and types
│   ├── implementations/  # Concrete algorithm/storage implementations
│   ├── factories/       # DI factories for instantiation
│   └── index.ts         # Public API
├── test/
│   ├── unit/            # Unit tests for algorithms
│   ├── integration/     # Integration tests with storage
│   └── fixtures/        # Mock data for testing
├── package.json
├── tsconfig.json
└── README.md
```

## Principles

1. **Dependency Inversion**: All components depend on interfaces, not implementations.
2. **Constructor Injection**: Dependencies are passed via constructors to facilitate testing.
3. **Single Responsibility**: Each component has a single, clear purpose.
4. **Standalone**: No dependencies on the Loopwork core package.

## Development

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Run tests
bun run test
```
