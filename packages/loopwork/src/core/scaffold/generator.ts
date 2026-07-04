import fs from 'fs'
import path from 'path'
import { HandlebarsEngine } from './handlebars-engine'
import { GeneratorResult, ScaffoldOptions, ScaffoldHooks } from './types'
import { logger } from '../utils'

export class ScaffoldGenerator {
  private engine: HandlebarsEngine

  constructor() {
    this.engine = new HandlebarsEngine()
  }

  async generate(options: ScaffoldOptions): Promise<GeneratorResult> {
    const { templateDir, outputDir, context, dryRun, force, hooks } = options
    const result: GeneratorResult = {
      filesCreated: [],
      filesSkipped: [],
      errors: [],
      duration: 0
    }
    const startTime = Date.now()

    try {
      if (hooks?.onStart) {
        await hooks.onStart(context)
      }

      if (!fs.existsSync(templateDir)) {
        throw new Error(`Template directory not found: ${templateDir}`)
      }

      const files = this.getFiles(templateDir)

      for (const file of files) {
        try {
          const relativePath = path.relative(templateDir, file)

          let renderedPath = this.engine.render(relativePath, context)

          const isTemplate = file.endsWith('.hbs')
          if (isTemplate) {
            if (renderedPath.endsWith('.hbs')) {
              renderedPath = renderedPath.slice(0, -4)
            }
          }

          const targetPath = path.join(outputDir, renderedPath)

          if (fs.existsSync(targetPath) && !force) {
            result.filesSkipped.push(renderedPath)
            if (hooks?.onFileSkipped) {
              await hooks.onFileSkipped(targetPath)
            }
            if (!dryRun) logger.warn(`Skipping existing file: ${renderedPath}`)
            continue
          }

          if (!dryRun) {
            const targetDir = path.dirname(targetPath)
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true })
            }

            let content = ''
            if (isTemplate) {
              content = fs.readFileSync(file, 'utf-8')
              const renderedContent = this.engine.render(content, context)
              fs.writeFileSync(targetPath, renderedContent)
            } else {
              fs.copyFileSync(file, targetPath)
              content = fs.readFileSync(targetPath, 'utf-8')
            }

            if (hooks?.onFileCreated) {
              await hooks.onFileCreated(targetPath, content)
            }
            logger.success(`Created: ${renderedPath}`)
          } else {
            logger.info(`[DryRun] Would create: ${renderedPath}`)
          }
          result.filesCreated.push(renderedPath)

        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err))
          result.errors.push(new Error(`Failed to process ${file}: ${error.message}`))
          if (hooks?.onFileError) {
            await hooks.onFileError(file, error)
          }
          logger.error(`Failed to process ${file}: ${error.message}`)
        }
      }

    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      result.errors.push(error)
      logger.error(`Scaffolding failed: ${error.message}`)
      if (hooks?.onFailure) {
        await hooks.onFailure(error)
      }
    }

    result.duration = Date.now() - startTime

    if (hooks?.onComplete) {
      await hooks.onComplete(result)
    }

    if (result.errors.length === 0 && hooks?.onSuccess) {
      await hooks.onSuccess(result)
    }

    return result
  }

  private getFiles(dir: string): string[] {
    let results: string[] = []
    const list = fs.readdirSync(dir)

    list.forEach(file => {
      file = path.join(dir, file)
      const stat = fs.statSync(file)
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getFiles(file))
      } else {
        results.push(file)
      }
    })
    return results
  }
}
