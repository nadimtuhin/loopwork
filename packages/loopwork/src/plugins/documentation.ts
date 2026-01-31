import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import type { LoopworkPlugin } from '../contracts'
import { logger } from '../core/utils'

/**
 * Documentation Plugin
 *
 * Automatically updates documentation when tasks complete.
 * Uses a lightweight model (default: Claude Haiku) for fast, cost-effective updates.
 */

export interface DocumentationPluginConfig {
  /** Enable automatic documentation updates */
  enabled?: boolean

  /** CLI tool to use for documentation generation */
  cli?: 'claude' | 'opencode' | 'gemini'

  /** Model to use (default: haiku for speed/cost) */
  model?: string

  /** Files to update automatically */
  files?: {
    /** Update README.md */
    readme?: boolean
    /** Update CHANGELOG.md */
    changelog?: boolean
    /** Update custom files */
    custom?: string[]
  }

  /** Documentation style/format preferences */
  style?: {
    /** Changelog format: 'keepachangelog' | 'conventional' | 'simple' */
    changelogFormat?: 'keepachangelog' | 'conventional' | 'simple'
    /** Include task ID in documentation */
    includeTaskId?: boolean
    /** Maximum length of generated content (in lines) */
    maxLines?: number
  }

  /** Skip documentation for certain task types */
  skip?: {
    /** Skip for tasks matching these patterns */
    taskPatterns?: string[]
    /** Skip for tasks with these labels/tags */
    labels?: string[]
  }
}

interface TaskContext {
  taskId: string
  title: string
  description?: string
  labels?: string[]
  output?: string
}

interface TaskResult {
  success: boolean
  output?: string
  error?: string
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
}

/**
 * Check if task should be skipped for documentation
 */
function shouldSkipTask(context: TaskContext, config: Required<DocumentationPluginConfig>): boolean {
  // Check task pattern skip rules
  if (config.skip.taskPatterns.some(pattern => pattern.test(context.title))) {
    return true
  }

  // Check label skip rules
  if (context.labels?.some(label => config.skip.labels.includes(label))) {
    return true
  }

  return false
}

/**
 * Generate documentation update using AI
 */
async function generateDocumentationUpdate(
  context: TaskContext,
  result: TaskResult,
  filePath: string,
  config: Required<DocumentationPluginConfig>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
    const fileType = path.basename(filePath)

    // Build prompt for documentation generation
    const prompt = buildDocumentationPrompt(context, result, fileType, fileContent, config)

    // Spawn AI CLI to generate update
    const args = ['--model', config.model]
    const child = spawn(config.cli, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Documentation generation failed: ${stderr}`))
        return
      }

      resolve(stdout.trim())
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ${config.cli}: ${err.message}`))
    })

    // Send prompt to stdin
    child.stdin?.write(prompt)
    child.stdin?.end()
  })
}

/**
 * Build prompt for documentation generation
 */
function buildDocumentationPrompt(
  context: TaskContext,
  result: TaskResult,
  fileType: string,
  currentContent: string,
  config: Required<DocumentationPluginConfig>
): string {
  const taskInfo = `
Task ID: ${context.taskId}
Task Title: ${context.title}
Task Description: ${context.description || 'N/A'}
Task Result: ${result.success ? 'Success' : 'Failed'}
${result.output ? `Task Output:\n${result.output.slice(0, 500)}` : ''}
`.trim()

  if (fileType === 'CHANGELOG.md') {
    return buildChangelogPrompt(taskInfo, currentContent, config)
  } else if (fileType === 'README.md') {
    return buildReadmePrompt(taskInfo, currentContent, config)
  } else {
    return buildGenericPrompt(taskInfo, fileType, currentContent, config)
  }
}

/**
 * Build CHANGELOG update prompt
 */
function buildChangelogPrompt(
  taskInfo: string,
  currentContent: string,
  config: Required<DocumentationPluginConfig>
): string {
  const format = config.style.changelogFormat
  const includeId = config.style.includeTaskId
  const maxLines = config.style.maxLines

  return `You are updating a CHANGELOG.md file after a task completion.

${taskInfo}

Current CHANGELOG (first 50 lines):
\`\`\`markdown
${currentContent.split('\n').slice(0, 50).join('\n')}
\`\`\`

Instructions:
1. Add a new entry to the CHANGELOG following the "${format}" format
2. Place the entry in the appropriate section (Added, Changed, Fixed, etc.)
3. ${includeId ? 'Include the task ID in the entry' : 'Do not include task IDs'}
4. Keep the entry concise (max ${maxLines} lines)
5. Maintain the existing format and style
6. Output ONLY the new changelog entry, not the entire file

Generate the new changelog entry:`
}

/**
 * Build README update prompt
 */
function buildReadmePrompt(
  taskInfo: string,
  currentContent: string,
  config: Required<DocumentationPluginConfig>
): string {
  const maxLines = config.style.maxLines

  return `You are updating a README.md file after a task completion.

${taskInfo}

Current README (first 100 lines):
\`\`\`markdown
${currentContent.split('\n').slice(0, 100).join('\n')}
\`\`\`

Instructions:
1. Determine if this task introduces a feature that should be documented in the README
2. If yes, generate a brief documentation section/update (max ${maxLines} lines)
3. If no, respond with "NO_UPDATE_NEEDED"
4. Maintain the existing format and style
5. Output ONLY the new/updated section, not the entire file

Generate the README update (or NO_UPDATE_NEEDED):`
}

/**
 * Build generic documentation prompt
 */
function buildGenericPrompt(
  taskInfo: string,
  fileType: string,
  currentContent: string,
  config: Required<DocumentationPluginConfig>
): string {
  const maxLines = config.style.maxLines

  return `You are updating the file "${fileType}" after a task completion.

${taskInfo}

Current file content (first 100 lines):
\`\`\`
${currentContent.split('\n').slice(0, 100).join('\n')}
\`\`\`

Instructions:
1. Generate an appropriate update for this documentation file (max ${maxLines} lines)
2. Maintain the existing format and style
3. Output ONLY the new/updated content, not the entire file
4. If no update is needed, respond with "NO_UPDATE_NEEDED"

Generate the documentation update:`
}

/**
 * Apply documentation update to file
 */
function applyDocumentationUpdate(
  filePath: string,
  update: string,
  fileType: string
): void {
  if (update.trim() === 'NO_UPDATE_NEEDED') {
    logger.debug(`No documentation update needed for ${fileType}`)
    return
  }

  const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''

  let updatedContent: string

  if (fileType === 'CHANGELOG.md') {
    // Insert at the top of the changelog (after header)
    const lines = currentContent.split('\n')
    const headerEndIndex = lines.findIndex((line, i) => i > 0 && line.startsWith('## '))
    if (headerEndIndex > -1) {
      lines.splice(headerEndIndex, 0, '', update, '')
      updatedContent = lines.join('\n')
    } else {
      updatedContent = `${currentContent}\n\n${update}`
    }
  } else {
    // Append to the end of the file
    updatedContent = `${currentContent}\n\n${update}`
  }

  fs.writeFileSync(filePath, updatedContent, 'utf-8')
  logger.success(`Updated ${fileType}`)
}

/**
 * Create documentation plugin
 */
export function createDocumentationPlugin(
  userConfig: DocumentationPluginConfig = {}
): LoopworkPlugin {
  const config: Required<DocumentationPluginConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    files: { ...DEFAULT_CONFIG.files, ...userConfig.files },
    style: { ...DEFAULT_CONFIG.style, ...userConfig.style },
    skip: { ...DEFAULT_CONFIG.skip, ...userConfig.skip },
  }

  return {
    name: 'documentation',

    async onTaskComplete(context: Record<string, unknown>, result: Record<string, unknown>) {
      if (!config.enabled) {
        return
      }

      const task = context.task as Record<string, unknown> | undefined
      const taskContext: TaskContext = {
        taskId: (context.taskId as string) || (task?.id as string) || 'unknown',
        title: (task?.title as string) || (context.taskId as string) || 'Unknown Task',
        description: (task?.description as string) || undefined,
        labels: ((context.task as Record<string, unknown>)?.labels as string[]) || [],
        output: (result?.output as string) || undefined,
      }

      const taskResult: TaskResult = {
        success: (result?.success as boolean) ?? true,
        output: (result?.output as string) || undefined,
        error: (result?.error as string) || undefined,
      }

      // Check if we should skip this task
      if (shouldSkipTask(taskContext, config)) {
        logger.debug(`Skipping documentation for task: ${taskContext.title}`)
        return
      }

      logger.info('Updating documentation...')

      const projectRoot = process.cwd()
      const filesToUpdate: string[] = []

      // Determine which files to update
      if (config.files.readme) {
        filesToUpdate.push(path.join(projectRoot, 'README.md'))
      }
      if (config.files.changelog) {
        filesToUpdate.push(path.join(projectRoot, 'CHANGELOG.md'))
      }
      if (config.files.custom) {
        filesToUpdate.push(...config.files.custom.map(f => path.join(projectRoot, f)))
      }

      // Update each file
      for (const filePath of filesToUpdate) {
        try {
          const update = await generateDocumentationUpdate(
            taskContext,
            taskResult,
            filePath,
            config
          )

          applyDocumentationUpdate(filePath, update, path.basename(filePath))
        } catch (err) {
          logger.warn(`Failed to update ${path.basename(filePath)}: ${err}`)
        }
      }
    },
  }
}

/**
 * Convenience export with common config patterns
 */
export function withDocumentation(config: DocumentationPluginConfig = {}): LoopworkPlugin {
  return createDocumentationPlugin(config)
}

/**
 * Preset: Auto-update CHANGELOG only
 */
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

/**
 * Preset: Auto-update README and CHANGELOG
 */
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
