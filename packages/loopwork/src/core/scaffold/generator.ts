import fs from 'fs';
import path from 'path';
import { HandlebarsEngine } from './handlebars-engine';
import { GeneratorResult, ScaffoldOptions } from './types';
import { logger } from '../utils';

export class ScaffoldGenerator {
  private engine: HandlebarsEngine;

  constructor() {
    this.engine = new HandlebarsEngine();
  }

  async generate(options: ScaffoldOptions): Promise<GeneratorResult> {
    const { templateDir, outputDir, context, dryRun, force } = options;
    const result: GeneratorResult = {
      filesCreated: [],
      filesSkipped: [],
      errors: [],
      duration: 0
    };
    const startTime = Date.now();

    try {
      if (!fs.existsSync(templateDir)) {
        throw new Error(`Template directory not found: ${templateDir}`);
      }

      const files = this.getFiles(templateDir);
      
      for (const file of files) {
        try {
          const relativePath = path.relative(templateDir, file);
          
          // Render the output path (support {{name}} in filenames)
          let renderedPath = this.engine.render(relativePath, context);
          
          const isTemplate = file.endsWith('.hbs');
          if (isTemplate) {
            // Strip .hbs extension from output
            if (renderedPath.endsWith('.hbs')) {
               renderedPath = renderedPath.slice(0, -4);
            }
          }

          const targetPath = path.join(outputDir, renderedPath);
          
          // Skip if exists and not force
          if (fs.existsSync(targetPath) && !force) {
            result.filesSkipped.push(renderedPath);
            if (!dryRun) logger.warn(`Skipping existing file: ${renderedPath}`);
            continue;
          }

          if (!dryRun) {
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            if (isTemplate) {
                const content = fs.readFileSync(file, 'utf-8');
                const renderedContent = this.engine.render(content, context);
                fs.writeFileSync(targetPath, renderedContent);
            } else {
                fs.copyFileSync(file, targetPath);
            }
            logger.success(`Created: ${renderedPath}`);
          } else {
            logger.info(`[DryRun] Would create: ${renderedPath}`);
          }
          result.filesCreated.push(renderedPath);

        } catch (err: unknown) {
          result.errors.push(new Error(`Failed to process ${file}: ${err instanceof Error ? err.message : String(err)}`));
          logger.error(`Failed to process ${file}: ${err.message}`);
        }
      }

    } catch (err: unknown) {
      result.errors.push(err instanceof Error ? err : new Error(String(err)));
      logger.error(`Scaffolding failed: ${err.message}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  private getFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getFiles(file));
      } else {
        results.push(file);
      }
    });
    return results;
  }
}
