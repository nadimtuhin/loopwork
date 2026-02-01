import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { ScaffoldGenerator } from '../src/core/scaffold';
import { HandlebarsEngine } from '../src/core/scaffold/handlebars-engine';

describe('Scaffolding', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-scaffold-test');
  const templateDir = path.join(tmpDir, 'templates');
  const outputDir = path.join(tmpDir, 'output');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(templateDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  test('HandlebarsEngine renders correctly', () => {
    const engine = new HandlebarsEngine();
    const result = engine.render('Hello {{name}}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  test('HandlebarsEngine supports helpers', () => {
    const engine = new HandlebarsEngine();
    expect(engine.render('{{uppercase name}}', { name: 'world' })).toBe('WORLD');
    expect(engine.render('{{lowercase name}}', { name: 'WORLD' })).toBe('world');
    expect(engine.render('{{capitalize name}}', { name: 'world' })).toBe('World');
  });

  test('ScaffoldGenerator generates files', async () => {
    // Setup template
    fs.writeFileSync(path.join(templateDir, 'static.txt'), 'Static content');
    fs.writeFileSync(path.join(templateDir, 'dynamic.txt.hbs'), 'Hello {{name}}');
    fs.writeFileSync(path.join(templateDir, '{{name}}.ts.hbs'), 'export const {{name}} = true;');

    const generator = new ScaffoldGenerator();
    const result = await generator.generate({
      templateDir,
      outputDir,
      context: { name: 'TestFeature' }
    });

    expect(result.filesCreated).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    // Verify static file
    expect(fs.readFileSync(path.join(outputDir, 'static.txt'), 'utf-8')).toBe('Static content');
    
    // Verify dynamic file (extension stripped)
    expect(fs.readFileSync(path.join(outputDir, 'dynamic.txt'), 'utf-8')).toBe('Hello TestFeature');
    
    // Verify dynamic filename
    expect(fs.readFileSync(path.join(outputDir, 'TestFeature.ts'), 'utf-8')).toBe('export const TestFeature = true;');
  });

  test('ScaffoldGenerator respects dryRun', async () => {
    fs.writeFileSync(path.join(templateDir, 'file.txt'), 'content');
    
    const generator = new ScaffoldGenerator();
    const result = await generator.generate({
      templateDir,
      outputDir,
      context: {},
      dryRun: true
    });

    expect(result.filesCreated).toHaveLength(1); // It reports what WOULD be created
    expect(fs.existsSync(path.join(outputDir, 'file.txt'))).toBe(false);
  });
});
