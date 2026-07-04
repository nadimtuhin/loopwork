import path from 'path'
import { ScaffoldGenerator } from '../core/scaffold'
import { InputValidator } from '../core/scaffold/input-validator'
import { logger } from '../core/utils'
import { LoopworkError } from '../core/errors'
import { ScaffoldHooks } from '../core/scaffold/types'

export interface ScaffoldCommandOptions {
  output?: string
  dryRun?: boolean
  force?: boolean
  skipValidation?: boolean
  hooks?: ScaffoldHooks
  [key: string]: unknown
  'plugin'?: string
}

export async function scaffold(templateName: string, name: string, options: ScaffoldCommandOptions) {
  const cwd = process.cwd()
  const templatesDir = path.join(cwd, '.specs/templates')
  const templatePath = path.join(templatesDir, templateName)

  logger.info(`Scaffolding '${templateName}' with name '${name}'...`)
  logger.debug(`Template source: ${templatePath}`)
  logger.debug(`Output target: ${options.output || cwd}`)

  if (!options.skipValidation) {
    const validator = new InputValidator()
    const data = { templateName, name, ...options }

    const templateConfig = InputValidator.defaultTemplateNameValidator()
    const nameConfig = InputValidator.defaultNameValidator()

    const templateResult = validator.validate(data, templateConfig)
    const nameResult = validator.validate(data, nameConfig)

    const allErrors = [...templateResult.errors, ...nameResult.errors]
    const allWarnings = [...templateResult.warnings, ...nameResult.warnings]

    for (const warning of allWarnings) {
      logger.warn(`Validation warning: ${warning.message}`)
    }

    if (allErrors.length > 0) {
      logger.error('Input validation failed:')
      allErrors.forEach(e => logger.error(`  ${e.field}: ${e.message}`))
      throw new LoopworkError(
        'ERR_PREFLIGHT_FAILED',
        'Scaffolding input validation failed',
        [
          'Fix the validation errors above',
          'Use --skip-validation to bypass validation (not recommended)'
        ]
      )
    }
  }

  const context: Record<string, unknown> = {
    name,
    ...options
  }

  const hooks = options.hooks || createDefaultHooks()

  const result = await new ScaffoldGenerator().generate({
    templateDir: templatePath,
    outputDir: options.output ? path.resolve(cwd, options.output) : cwd,
    context,
    dryRun: options.dryRun,
    force: options.force,
    hooks
  })

  if (result.errors.length > 0) {
    logger.error('Scaffolding encountered errors:')
    result.errors.forEach(e => logger.error(`  ${e.message}`))
    if (result.filesCreated.length === 0) {
      throw new LoopworkError(
        'ERR_UNKNOWN',
        'Scaffolding failed completely',
        [
          'Check template syntax and requirements',
          'Ensure you have write permissions in the output directory',
          'Try running with --dry-run to see what would happen'
        ]
      )
    }
  }

  logger.success(`Scaffolding complete in ${result.duration}ms`)
  logger.info(`Created: ${result.filesCreated.length}, Skipped: ${result.filesSkipped.length}`)
}

function createDefaultHooks(): ScaffoldHooks {
  return {
    onStart: (context) => {
      logger.debug(`Starting scaffolding with context: ${JSON.stringify(context)}`)
    },
    onFileCreated: (filePath, content) => {
      logger.debug(`File created hook: ${filePath}`)
    },
    onFileSkipped: (filePath) => {
      logger.info(`File already exists, skipping: ${filePath}`)
    },
    onFileError: (filePath, error) => {
      logger.error(`Error creating file ${filePath}: ${error.message}`)
    },
    onComplete: (result) => {
      logger.debug(`Scaffolding completed with ${result.filesCreated.length} files created, ${result.errors.length} errors`)
    },
    onSuccess: (result) => {
      logger.success(`Successfully created ${result.filesCreated.length} file(s)`)
    },
    onFailure: (error) => {
      logger.error(`Scaffolding failed: ${error.message}`)
    }
  }
}
