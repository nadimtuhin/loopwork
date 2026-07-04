import fs from 'fs'
import path from 'path'
import type { LoopworkPlugin, TaskContext, PluginTaskResult } from '../contracts'
import type { IDocGenerator, IChangeLogProvider } from '@loopwork-ai/contracts'
import { DocGenerator, ChangelogProvider } from '@loopwork-ai/doc-engine'
import { logger } from '../core/utils'

export interface DocumentationPluginConfig {
  enabled?: boolean
  cli?: 'claude' | 'opencode' | 'gemini'
  model?: string
  files?: {
    readme?: boolean
    changelog?: boolean
    custom?: string[]
  }
  style?: {
    changelogFormat?: 'keepachangelog' | 'conventional' | 'simple'
    includeTaskId?: boolean
    maxLines?: number
  }
  skip?: {
    /** Skip for tasks matching these patterns */
    taskPatterns?: RegExp[]
    /** Skip for tasks with these labels/tags */
    labels?: string[]
  }
  docGenerator?: IDocGenerator
  changelogProvider?: IChangeLogProvider
}

const DEFAULT_CONFIG: Required<DocumentationPluginConfig> = {
  enabled: true,
  cli: 'claude',
  model: 'haiku',
  files: {
    readme: false,
    changelog: true,
    custom: [],
  },
  style: {
    changelogFormat: 'keepachangelog',
    includeTaskId: true,
    maxLines: 10,
  },
  skip: {
    taskPatterns: [/^test:/i, /^chore:/i],
    labels: ['no-docs', 'internal'],
  },
  docGenerator: undefined as any,
  changelogProvider: undefined as any,
}

function shouldSkipTask(context: TaskContext, config: Required<DocumentationPluginConfig>): boolean {
  const taskPatterns = config.skip.taskPatterns || []
  if (taskPatterns.some(pattern => pattern.test(context.task.title))) {
    return true
  }

  const labels = (context.task as any).labels || []
  const skipLabels = config.skip.labels || []
  if (labels.some((label: string) => skipLabels.includes(label))) {
    return true
  }

  return false
}

export function createDocumentationPlugin(
  userConfig: DocumentationPluginConfig = {}
): LoopworkPlugin {
  const docGenerator = userConfig.docGenerator || new DocGenerator({ logger })
  const changelogProvider = userConfig.changelogProvider || new ChangelogProvider({ logger })

  const config: Required<DocumentationPluginConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    files: { ...DEFAULT_CONFIG.files, ...userConfig.files },
    style: { ...DEFAULT_CONFIG.style, ...userConfig.style },
    skip: { ...DEFAULT_CONFIG.skip, ...userConfig.skip },
    docGenerator,
    changelogProvider,
  }

  return {
    name: 'documentation',

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!config.enabled) {
        return
      }

      if (shouldSkipTask(context, config)) {
        logger.debug(`Skipping documentation for task: ${context.task.title}`)
        return
      }

      logger.info('Updating documentation...')

      const projectRoot = process.cwd()
      const tasks: Promise<void>[] = []

      if (config.files.readme) {
        const readmePath = path.join(projectRoot, 'README.md')
        tasks.push(updateDocumentationFile(
          readmePath,
          'README.md',
          context,
          result,
          config
        ))
      }

      if (config.files.changelog) {
        const changelogPath = path.join(projectRoot, 'CHANGELOG.md')
        tasks.push(updateChangelogFile(
          changelogPath,
          context,
          result,
          config
        ))
      }

      if (config.files.custom) {
        for (const customFile of config.files.custom) {
          const filePath = path.join(projectRoot, customFile)
          const fileType = path.basename(customFile)
          tasks.push(updateDocumentationFile(
            filePath,
            fileType,
            context,
            result,
            config
          ))
        }
      }

      await Promise.all(tasks).catch((err) => {
        logger.warn(`Documentation update completed with errors: ${err}`)
      })
    },
  }
}

async function updateDocumentationFile(
  filePath: string,
  fileType: string,
  context: TaskContext,
  result: PluginTaskResult,
  config: Required<DocumentationPluginConfig>
): Promise<void> {
  try {
    const docGenerator = config.docGenerator
    const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
    
    const docResult = await docGenerator.generateDoc(
      {
        taskId: context.task.id,
        title: context.task.title,
        description: context.task.description,
        labels: (context.task as any).labels,
        output: result.output,
        success: result.success,
        error: undefined,
        fileType,
      },
      filePath,
      currentContent,
      {
        model: config.model,
        cli: config.cli,
        maxLines: config.style.maxLines,
        includeTaskId: config.style.includeTaskId,
      }
    )
    
    await docGenerator.applyDoc(filePath, docResult.content, fileType)
  } catch (err) {
    logger.warn(`Failed to update ${fileType}: ${err}`)
  }
}

async function updateChangelogFile(
  filePath: string,
  context: TaskContext,
  result: PluginTaskResult,
  config: Required<DocumentationPluginConfig>
): Promise<void> {
  try {
    const changelogProvider = config.changelogProvider
    
    const changelogResult = await changelogProvider.generateEntry(
      {
        taskId: context.task.id,
        title: context.task.title,
        description: context.task.description,
        labels: (context.task as any).labels,
        output: result.output,
        success: result.success,
        error: undefined,
      },
      {
        format: config.style.changelogFormat || 'keepachangelog',
        includeTaskId: config.style.includeTaskId ?? true,
        maxLines: config.style.maxLines || 10,
      }
    )
    
    if (!changelogResult.noUpdateNeeded) {
      await changelogProvider.updateChangelog(filePath, changelogResult.entry)
    }
  } catch (err) {
    logger.warn(`Failed to update CHANGELOG.md: ${err}`)
  }
}

export function withDocumentation(config: DocumentationPluginConfig = {}): LoopworkPlugin {
  return createDocumentationPlugin(config)
}

export function withChangelogOnly(config: Partial<DocumentationPluginConfig> = {}): LoopworkPlugin {
  return createDocumentationPlugin({
    ...config,
    files: {
      readme: false,
      changelog: true,
      custom: [],
    },
  })
}

export function withFullDocumentation(config: Partial<DocumentationPluginConfig> = {}): LoopworkPlugin {
  return createDocumentationPlugin({
    ...config,
    files: {
      readme: true,
      changelog: true,
      custom: config.files?.custom || [],
    },
  })
}
