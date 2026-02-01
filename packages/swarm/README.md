# @loopwork-ai/swarm

Multi-agent swarm coordination for Loopwork.

## Features

- **Agent Persona Schema**: strict Zod schema for defining agent personas (`AgentPersona`)

## Usage

```typescript
import { AgentPersonaSchema } from '@loopwork-ai/swarm'

const persona = {
  name: 'researcher',
  description: 'Conducts web research',
  prompt: 'You are an expert researcher...',
  role: 'specialist',
  capabilities: ['web-search', 'summarization']
}

// Validate
const result = AgentPersonaSchema.safeParse(persona)
if (result.success) {
  console.log('Valid persona:', result.data)
}
```
