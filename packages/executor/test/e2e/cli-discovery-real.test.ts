import { describe, test, expect } from 'bun:test'
import { createCliDiscoveryService } from '../../src/cli-discovery'

describe('CLI Discovery Real E2E', () => {
  test('discovers available CLIs on local machine', async () => {
    const service = createCliDiscoveryService()
    const result = await service.discoverAll({ timeoutMs: 10000 })

    console.log('--- CLI Discovery Result ---')
    console.log(result.summary)
    
    for (const cli of result.clis) {
      if (cli.status === 'healthy') {
        console.log(`[PASS] ${cli.type} (v${cli.version || 'unknown'}) at ${cli.path} (${cli.responseTimeMs}ms)`)
        
        const models = await service.listModels(cli.type)
        if (models.length > 0) {
          console.log(`       Models: ${models.slice(0, 5).join(', ')}${models.length > 5 ? '...' : ''}`)
        }
      } else if (cli.status !== 'not_found') {
        console.log(`[FAIL] ${cli.type} status: ${cli.status}, error: ${cli.error || 'none'}`)
      } else {
        console.log(`[SKIP] ${cli.type} not found`)
      }
    }
    console.log('---------------------------')

    expect(result.clis.length).toBeGreaterThan(0)
    expect(typeof result.healthyCount).toBe('number')
  }, 30000)
})
