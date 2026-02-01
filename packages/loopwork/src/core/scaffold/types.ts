export interface TemplateEngine {
  /**
   * Render a template string with the given context
   */
  render(template: string, context: Record<string, unknown>): string;
}

export interface ScaffoldOptions {
  /** Directory containing template files */
  templateDir: string;
  /** Directory where files should be generated */
  outputDir: string;
  /** Data to pass to templates */
  context: Record<string, unknown>;
  /** If true, do not write files */
  dryRun?: boolean;
  /** If true, overwrite existing files */
  force?: boolean;
}

export interface GeneratorResult {
  filesCreated: string[];
  filesSkipped: string[];
  errors: Error[];
  duration: number;
}
