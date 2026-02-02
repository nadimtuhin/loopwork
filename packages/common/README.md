# @loopwork-ai/common

> Shared utilities for Loopwork packages

[![npm version](https://img.shields.io/npm/v/@loopwork-ai/common.svg)](https://www.npmjs.com/package/@loopwork-ai/common)

## Overview

The `@loopwork-ai/common` package provides shared utilities used across the Loopwork monorepo, including logging, timestamping, checksums, and stream processing.

## Installation

```bash
bun add @loopwork-ai/common
```

## Features

### Logging (`src/logger.ts`)

The `ConsoleLogger` class provides a standard console-based logging implementation:

```typescript
import { logger, ConsoleLogger } from '@loopwork-ai/common'

// Use the default logger instance
logger.info('Task started')
logger.success('Task completed')
logger.warn('Warning message')
logger.error('Error message')
logger.debug('Debug information')

// Or create a custom logger instance
const customLogger = new ConsoleLogger({
  logLevel: 'debug',
  logFile: '.loopwork/logs/app.log',
})
```

#### Log Levels

| Level | Description |
|-------|-------------|
| `trace` | Very verbose debug information |
| `debug` | Debug information |
| `info` | General information |
| `success` | Success messages |
| `warn` | Warnings |
| `error` | Errors |
| `silent` | Suppress all output |

#### ConsoleLogger API

```typescript
class ConsoleLogger {
  /** Create a new ConsoleLogger instance */
  constructor(options?: { logLevel?: LogLevel; logFile?: string | null })

  /** Set the file path for persistent logging */
  setLogFile(filePath: string): void

  /** Set the minimum log level for console output */
  setLogLevel(level: LogLevel): void

  /** Log an informational message */
  info(msg: string): void

  /** Log a success message */
  success(msg: string): void

  /** Log a warning message */
  warn(msg: string): void

  /** Log an error message */
  error(msg: string): void

  /** Log a debug message */
  debug(msg: string): void

  /** Log a trace message (very verbose) */
  trace(msg: string): void

  /** Update the current line (useful for progress bars) */
  update(msg: string, percent?: number): void

  /** Start a spinner with a message */
  startSpinner(msg: string, percent?: number): void

  /** Stop the current spinner */
  stopSpinner(msg?: string, symbol?: string): void

  /** Output raw text without formatting */
  raw(msg: string, noNewline?: boolean): void
}
```

### Utilities (`src/utils.ts`)

Common utility functions:

```typescript
import { getTimestamp, calculateChecksum, StreamLogger } from '@loopwork-ai/common'

// Get current timestamp in HH:MM:SS format
const timestamp = getTimestamp()

// Calculate SHA-256 checksum
const hash = calculateChecksum({ data: 'example' })

// StreamLogger for handling CLI output
const streamLogger = new StreamLogger(logger, '[CLI]')
streamLogger.log('output data')
streamLogger.flush()
```

#### StreamLogger

The `StreamLogger` class handles streaming output from CLI processes:

```typescript
class StreamLogger {
  constructor(
    logger: ILogger,
    prefix?: string,
    onEvent?: (event: { type: string; data: unknown }) => void
  )

  /** Temporarily pause output processing */
  pause(): void

  /** Resume output processing and flush buffered content */
  resume(): void

  /** Process a chunk of data from the stream */
  log(chunk: string | Buffer): void

  /** Flush any remaining buffered content */
  flush(): void
}
```

## Type Definitions

### LogLevel

```typescript
type LogLevel = 'trace' | 'debug' | 'info' | 'success' | 'warn' | 'error' | 'silent'
```

### ILogger

```typescript
interface ILogger {
  setLogFile(filePath: string): void
  setLogLevel(level: LogLevel): void
  info(msg: string): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  debug(msg: string): void
  trace(msg: string): void
  update(msg: string, percent?: number): void
  startSpinner(msg: string, percent?: number): void
  stopSpinner(msg?: string, symbol?: string): void
  raw(msg: string, noNewline?: boolean): void
}
```

## Related Packages

- `@loopwork-ai/contracts` - Interface definitions including `ILogger`
- `@loopwork-ai/loopwork` - Main framework that uses these utilities

## License

MIT
