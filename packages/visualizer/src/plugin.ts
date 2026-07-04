import { LoopworkPlugin, LoopStats, TaskBackend } from '@loopwork-ai/loopwork/contracts'
import { ReportGenerator } from './reporting/generator'
import { ReportOptions } from './reporting/types'

export interface ReportingPluginOptions extends ReportOptions {
  enabled?: boolean
}

export function withReporting(options: ReportingPluginOptions = {}): LoopworkPlugin {
  let backend: TaskBackend
  let namespace: string
  const generator = new ReportGenerator()

  return {
    name: 'visualizer-reporting',

    async onBackendReady(be: TaskBackend) {
      backend = be
    },

    async onLoopStart(ns: string) {
      namespace = ns
    },

    async onLoopEnd(stats: LoopStats) {
      if (options.enabled === false) return

      try {
        const tasks = await backend.listTasks()
        const data = {
          namespace,
          timestamp: new Date().toISOString(),
          stats,
          tasks
        }

        const files = await generator.generate(data, options)
        console.log(`Generated reports: ${files.join(', ')}`)
      } catch (error) {
        console.error(`Failed to generate reports: ${error}`)
      }
    }
  }
}
