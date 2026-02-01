import path from 'path';
import { ScaffoldGenerator } from '../core/scaffold';
import { logger } from '../core/utils';

export interface ScaffoldCommandOptions {
  output?: string;
  dryRun?: boolean;
  force?: boolean;
  [key: string]: unknown;
}

export async function scaffold(templateName: string, name: string, options: ScaffoldCommandOptions) {
  const cwd = process.cwd();
  // Convention: Look for templates in .specs/templates
  const templatesDir = path.join(cwd, '.specs/templates'); 
  const templatePath = path.join(templatesDir, templateName);

  const outputDir = options.output ? path.resolve(cwd, options.output) : cwd;

  // Context construction (include CLI options as context variables)
  const context = {
    name,
    ...options
  };

  logger.info(`Scaffolding '${templateName}' with name '${name}'...`);
  logger.debug(`Template source: ${templatePath}`);
  logger.debug(`Output target: ${outputDir}`);

  const generator = new ScaffoldGenerator();
  const result = await generator.generate({
    templateDir: templatePath,
    outputDir,
    context,
    dryRun: options.dryRun,
    force: options.force
  });

  if (result.errors.length > 0) {
    logger.error('Scaffolding encountered errors:');
    result.errors.forEach(e => logger.error(`- ${e.message}`));
    if (result.filesCreated.length === 0) {
        throw new Error('Scaffolding failed completely');
    }
  } else {
    logger.success(`Scaffolding complete in ${result.duration}ms`);
    logger.info(`Created: ${result.filesCreated.length}, Skipped: ${result.filesSkipped.length}`);
  }
}
