import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { ScaffoldGenerator } from '../src/core/scaffold'
import { HandlebarsEngine } from '../src/core/scaffold/handlebars-engine'
import { ScaffoldHooks } from '../src/core/scaffold/types'

describe('Scaffolding', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-scaffold-test')
  const templateDir = path.join(tmpDir, 'templates')
  const outputDir = path.join(tmpDir, 'output')

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })
    fs.mkdirSync(templateDir, { recursive: true })
    fs.mkdirSync(outputDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })
  })

  test('HandlebarsEngine renders correctly', () => {
    const engine = new HandlebarsEngine()
    const result = engine.render('Hello {{name}}', { name: 'World' })
    expect(result).toBe('Hello World')
  })

  test('HandlebarsEngine supports helpers', () => {
    const engine = new HandlebarsEngine()
    expect(engine.render('{{uppercase name}}', { name: 'world' })).toBe('WORLD')
    expect(engine.render('{{lowercase name}}', { name: 'WORLD' })).toBe('world')
    expect(engine.render('{{capitalize name}}', { name: 'world' })).toBe('World')
  })

  test('ScaffoldGenerator generates files', async () => {
    fs.writeFileSync(path.join(templateDir, 'static.txt'), 'Static content')
    fs.writeFileSync(path.join(templateDir, 'dynamic.txt.hbs'), 'Hello {{name}}')
    fs.writeFileSync(path.join(templateDir, '{{name}}.ts.hbs'), 'export const {{name}} = true;')

    const generator = new ScaffoldGenerator()
    const result = await generator.generate({
      templateDir,
      outputDir,
      context: { name: 'TestFeature' }
    })

    expect(result.filesCreated).toHaveLength(3)
    expect(result.errors).toHaveLength(0)

    expect(fs.readFileSync(path.join(outputDir, 'static.txt'), 'utf-8')).toBe('Static content')
    expect(fs.readFileSync(path.join(outputDir, 'dynamic.txt'), 'utf-8')).toBe('Hello TestFeature')
    expect(fs.readFileSync(path.join(outputDir, 'TestFeature.ts'), 'utf-8')).toBe('export const TestFeature = true;')
  })

  test('ScaffoldGenerator respects dryRun', async () => {
    fs.writeFileSync(path.join(templateDir, 'file.txt'), 'content')

    const generator = new ScaffoldGenerator()
    const result = await generator.generate({
      templateDir,
      outputDir,
      context: {},
      dryRun: true
    })

    expect(result.filesCreated).toHaveLength(1)
    expect(fs.existsSync(path.join(outputDir, 'file.txt'))).toBe(false)
  })

  test('ScaffoldGenerator calls onStart hook', async () => {
    fs.writeFileSync(path.join(templateDir, 'file.txt'), 'content')

    let onStartCalled = false
    const hooks: ScaffoldHooks = {
      onStart: (context) => {
        onStartCalled = true
        expect(context.name).toBe('TestName')
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir,
      outputDir,
      context: { name: 'TestName' },
      hooks
    })

    expect(onStartCalled).toBe(true)
  })

  test('ScaffoldGenerator calls onFileCreated hook', async () => {
    fs.writeFileSync(path.join(templateDir, 'file.txt'), 'content')

    const createdFiles: string[] = []
    const hooks: ScaffoldHooks = {
      onFileCreated: (filePath) => {
        createdFiles.push(filePath)
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir,
      outputDir,
      context: {},
      hooks
    })

    expect(createdFiles.length).toBeGreaterThan(0)
  })

  test('ScaffoldGenerator calls onFileSkipped hook', async () => {
    fs.writeFileSync(path.join(templateDir, 'existing.txt'), 'existing content')
    fs.writeFileSync(path.join(outputDir, 'existing.txt'), 'already exists')

    const skippedFiles: string[] = []
    const hooks: ScaffoldHooks = {
      onFileSkipped: (filePath) => {
        skippedFiles.push(filePath)
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir,
      outputDir,
      context: {},
      hooks,
      force: false
    })

    expect(skippedFiles.length).toBeGreaterThan(0)
  })

  test('ScaffoldGenerator calls onComplete hook', async () => {
    fs.writeFileSync(path.join(templateDir, 'file.txt'), 'content')

    let onCompleteCalled = false
    const hooks: ScaffoldHooks = {
      onComplete: (result) => {
        onCompleteCalled = true
        expect(result.filesCreated.length).toBeGreaterThan(0)
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir,
      outputDir,
      context: {},
      hooks
    })

    expect(onCompleteCalled).toBe(true)
  })

  test('ScaffoldGenerator calls onSuccess hook on success', async () => {
    fs.writeFileSync(path.join(templateDir, 'file.txt'), 'content')

    let onSuccessCalled = false
    const hooks: ScaffoldHooks = {
      onSuccess: (result) => {
        onSuccessCalled = true
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir,
      outputDir,
      context: {},
      hooks
    })

    expect(onSuccessCalled).toBe(true)
  })

  test('ScaffoldGenerator calls onFailure hook on failure', async () => {
    let onFailureCalled = false
    const hooks: ScaffoldHooks = {
      onFailure: (error) => {
        onFailureCalled = true
        expect(error.message).toContain('Template directory not found')
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir: '/nonexistent/path',
      outputDir,
      context: {},
      hooks
    })

    expect(onFailureCalled).toBe(true)
  })

  test('ScaffoldGenerator does not call onSuccess on failure', async () => {
    let onSuccessCalled = false
    let onFailureCalled = false
    const hooks: ScaffoldHooks = {
      onSuccess: () => {
        onSuccessCalled = true
      },
      onFailure: () => {
        onFailureCalled = true
      }
    }

    const generator = new ScaffoldGenerator()
    await generator.generate({
      templateDir: '/nonexistent/path',
      outputDir,
      context: {},
      hooks
    })

    expect(onFailureCalled).toBe(true)
    expect(onSuccessCalled).toBe(false)
  })
})
