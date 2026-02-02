# @loopwork-ai/swarm

Multi-agent swarm coordination for Loopwork.

## Features

- **Agent Persona Schema**: strict Zod schema for defining agent personas (`AgentPersona`)
- **Manager-Worker Delegation**: hierarchical task delegation where agents can return sub-tasks to the coordinator
- **Parallel Coordination**: execute multiple agents concurrently with built-in batching and concurrency control
- **Build Result Aggregation**: comprehensive result aggregation with filtering, statistics, and export capabilities

## Usage

### Defining a Persona

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

### Running a Swarm with Delegation

```typescript
import { SwarmCoordinator, ManagerAgent, TestGeneratorAgent } from '@loopwork-ai/swarm'

const coordinator = new SwarmCoordinator({ maxConcurrency: 5 })

// Register agents
coordinator.registerAgent(new ManagerAgent())
coordinator.registerAgent(new TestGeneratorAgent({ ... }))

// Add high-level task
coordinator.addTask({
  id: 'main-task',
  type: 'delegate',
  target: 'root',
  priority: 10,
  context: {
    type: 'package-test',
    packages: ['core', 'common']
  }
})

// Run coordinator (handles delegation automatically)
const results = await coordinator.run()
console.log(coordinator.generateReport())
```

### Build Result Aggregation

The swarm provides comprehensive result aggregation capabilities:

```typescript
import { SwarmCoordinator, BuildResultAggregator } from '@loopwork-ai/swarm'

const coordinator = new SwarmCoordinator({ maxConcurrency: 5 })
// ... run tasks ...

// Method 1: Use coordinator's built-in aggregation
console.log(coordinator.generateAggregatedReport())

// Method 2: Create standalone aggregator
const aggregator = coordinator.createAggregator()

// Get comprehensive metrics
const metrics = aggregator.getMetrics()
console.log(`Success rate: ${metrics.successRate}%`)
console.log(`Total duration: ${metrics.totalDuration}ms`)

// Group by package
const byPackage = aggregator.getMetricsByPackage()
for (const pkg of byPackage) {
  console.log(`${pkg.package}: ${pkg.successful}/${pkg.total} successful`)
}

// Get timing statistics
const timing = aggregator.getTimingMetrics()
console.log(`Average: ${timing?.average}ms`)
console.log(`P95: ${timing?.percentiles.p95}ms`)

// Filter results
const failed = aggregator.filter({ status: 'failed' })
const slow = aggregator.filter({ minDuration: 5000 })

// Export in various formats
const json = coordinator.exportToJSON({ pretty: true })
const markdown = coordinator.exportToMarkdown()
const html = coordinator.exportToHTML()
```
