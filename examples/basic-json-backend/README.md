# Basic JSON Backend Example

A simple TypeScript project demonstrating Loopwork with a JSON backend, featuring basic utility functions.

## Functions

### sayHello()
Returns a greeting message.

### sum(a: number, b: number)
Adds two numbers together. Supports integers and decimals.

## Usage

### Install dependencies
```bash
bun install
```

### Run tests
```bash
bun test
```

### Example Code
```typescript
import { sayHello } from './hello'
import { sum } from './math'

console.log(sayHello()) // 'Hello, World!'
console.log(sum(2, 3))  // 5
```
