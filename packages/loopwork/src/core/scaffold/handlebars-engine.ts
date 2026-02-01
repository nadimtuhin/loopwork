import Handlebars from 'handlebars';
import { TemplateEngine } from './types';

export class HandlebarsEngine implements TemplateEngine {
  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    Handlebars.registerHelper('uppercase', (str: string) => str?.toUpperCase());
    Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase());
    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1);
    });
  }

  render(template: string, context: Record<string, unknown>): string {
    const compiled = Handlebars.compile(template);
    return compiled(context);
  }
}
