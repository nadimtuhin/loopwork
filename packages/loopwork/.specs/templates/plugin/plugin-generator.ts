import fs from 'fs';
import path from 'path';
import { HandlebarsEngine } from './handlebars-engine';
import { logger } from '../utils';
import { GeneratorResult, ScaffoldOptions } from './types';

/**
 * Plugin-specific scaffolding generator for Loopwork plugins
 * Creates standard plugin boilerplate with all necessary files
 */
export class PluginGenerator {
  private templateDir: string;
  private outputDir: string;
  
  constructor(pluginTemplateDir: string) {
    this.templateDir = pluginTemplateDir;
  }

  /**
   * Generate a new plugin from the standard plugin template
   */
  async generatePlugin(pluginName: string, options: {
    name: string,
    description?: string,
    outputPath?: string
  }): Promise<GeneratorResult> {
    const cwd = process.cwd();
    const context = {
      name,
      description,
      ...options
    };
    
    const result: GeneratorResult = {
      filesCreated: [],
      filesSkipped: [],
      errors: [],
      duration: 0
    };
    
    const startTime = Date.now();
    
    try {
      logger.info(`Generating plugin '${name}'...`);
      
      // 1. Create output directory
      const outputDir = outputPath ? path.resolve(cwd, outputPath) : path.join(cwd, name);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        logger.success(`Created output directory: ${outputDir}`);
      } else {
        logger.warn(`Output directory exists: ${outputDir}`);
      }
      
      // 2. Copy and render plugin templates
      const templatesPath = path.join(this.templateDir, 'plugin');
      const pluginOutputPath = path.join(outputDir, 'plugin');
      
      const templates = ['README.md.hbs', 'index.ts.hbs', 'package.json.hbs'];
      
      for (const template of templates) {
        const templateFilePath = path.join(templatesPath, template);
        
        if (fs.existsSync(templateFilePath)) {
          const relativePath = path.relative(templatesPath, template);
          let renderedPath = this.engine.render(relativePath, context);
          
          // Handle .hbs extension
          const isTemplate = template.endsWith('.hbs');
          if (isTemplate && renderedPath.endsWith('.hbs')) {
            renderedPath = renderedPath.slice(0, -4);
          }
          
          const targetPath = path.join(pluginOutputPath, renderedPath);
          
          const targetDir = path.dirname(targetPath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          if (isTemplate) {
            const content = fs.readFileSync(templateFilePath, 'utf-8');
            const renderedContent = this.engine.render(content, context);
            fs.writeFileSync(targetPath, renderedContent);
            result.filesCreated.push(renderedPath);
            logger.success(`Created: ${renderedPath}`);
          } else {
            fs.copyFileSync(templateFilePath, targetPath);
            result.filesCreated.push(targetPath);
            logger.success(`Copied: ${renderedPath}`);
          }
        }
      }
      
      // 3. Create types file
      const typesPath = path.join(outputDir, 'types.d.ts');
      const typesContent = `
import type { LoopworkPlugin, LoopworkConfig, TaskContext, LoopStats, PluginTaskResult } from 'loopwork'

export interface ${this.toPascalCase(name)}Options {
  ${this.toCamelCase(name)}Options?: any;
}

export function create${this.toPascalCase(name)}(options: ${this.toPascalCase(name)}Options): LoopworkPlugin {
  return {
    name: '${name}',
${this.generatePluginHooks(name)}
  }
}

${this.generatePluginHelpers(name)}
`;
      fs.writeFileSync(typesPath, typesContent);
      result.filesCreated.push(typesPath);
      logger.success(`Created: ${typesPath}`);
      
    } catch (err: unknown) {
      result.errors.push(new Error(`Failed to generate plugin: ${err instanceof Error ? err.message : String(err)}`));
      logger.error(`Scaffolding failed: ${err.message}`);
    }
    
    result.duration = Date.now() - startTime;
    return result;
  }
  
  /**
   * Convert plugin name to PascalCase for type names
   */
  private toPascalCase(name: string): string {
    return name.split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
  
  /**
   * Convert plugin name to camelCase for function names
   */
  private toCamelCase(name: string): string {
    const pascal = this.toPascalCase(name);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
  
  /**
   * Generate lifecycle hook implementations
   */
  private generatePluginHooks(name: string): string {
    return `  async onConfigLoad(config: LoopworkConfig) {
      console.log('[${name}] Plugin loaded')
      return config
    },

    async onLoopStart(namespace: string) {
      console.log('[${name}] Loop starting for namespace:', namespace)
    },

    async onTaskStart(context: TaskContext) {
      const { task, iteration } = context
      console.log('[${name}] Task starting:', task.id, '(iteration', iteration, ')')
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      const { task } = context
      const { duration } = result
      console.log('[${name}] Task completed:', task.id, '(' + duration.toFixed(2) + 'ms)')
    },

    async onTaskFailed(context: TaskContext, error: string) {
      const { task } = context
      console.error('[${name}] Task failed:', task.id, error)
    },

    async onLoopEnd(stats: LoopStats) {
      console.log('[${name}] Loop ended:', stats.completed, 'completed,', stats.failed, 'failed')
    }
  `;
  }
  
  /**
   * Generate helper type exports
   */
  private generatePluginHelpers(name: string): string {
    return `  export interface ${this.toPascalCase(name)}Options {
  ${this.toCamelCase(name)}Options?: any;
}

export function create${this.toPascalCase(name)}(options: ${this.toPascalCase(name)}Options): LoopworkPlugin {
  return {
    name: '${name}',
${this.generatePluginHooks(name)}
  }
}
`;
  }
}
