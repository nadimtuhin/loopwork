# MEMORY-003: Retrieval & Sliding Window Context Management

## Goal
Implement retrieval mechanism and sliding window context management for the memory system.

## Feature
memory

## Requirements
- Implement `MemoryRetriever` class for semantic/keyword retrieval from vector store
- Implement `SlidingWindowContextManager` for context window management with token limits
- Add support for token-based eviction and priority-based item selection
- Provide factory functions for easy creation
- Add comprehensive tests

## Implementation Details

### Files Created
- `packages/loopwork/src/memory/retriever.ts` - MemoryRetriever class
- `packages/loopwork/src/memory/sliding-window-context.ts` - SlidingWindowContextManager class
- `packages/loopwork/src/memory/index.ts` - Module exports
- `packages/loopwork/test/memory/retriever.test.ts` - Retriever tests
- `packages/loopwork/test/memory/sliding-window-context.test.ts` - Sliding window tests

### Key Features

#### MemoryRetriever
- Semantic and keyword-based retrieval from vector store
- Token limit enforcement for retrieved content
- Retrieval statistics with timing and token counts
- Batch retrieval support for multiple queries
- Context formatting for AI prompts with source attribution

#### SlidingWindowContextManager
- Token-based context window management
- Priority-based item eviction when limits exceeded
- Recent message prioritization option
- Statistics tracking for dropped items/tokens
- Custom token estimation support

## Success Criteria
- [x] MemoryRetriever implemented and tested
- [x] SlidingWindowContextManager implemented and tested
- [x] All 44 tests passing
- [x] Module exported from main package
- [x] Documentation updated

## Usage Example

```typescript
import { MemoryRetriever, SlidingWindowContextManager } from 'loopwork/memory'

// Create retriever
const retriever = new MemoryRetriever({
  vectorStore,
  embeddingProvider,
})

// Retrieve relevant documents
const results = await retriever.retrieve('authentication code', {
  limit: 5,
  maxTokens: 2000,
})

// Create sliding window context manager
const contextManager = new SlidingWindowContextManager({
  maxTokens: 8000,
  reservedTokens: 1000, // Reserve for system prompt
  prioritizeRecent: true,
})

// Add conversation context
contextManager.add({
  id: 'msg-1',
  content: 'User asked about authentication',
  type: 'user',
  priority: 1,
})

contextManager.add({
  id: 'retrieved-auth',
  content: 'Auth code from codebase...',
  type: 'retrieved',
  priority: 2, // Higher priority for retrieved content
})
```
