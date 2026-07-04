import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import type { CommandContext, ILogger } from '@loopwork-ai/contracts'
import { InitCommand, createInitCommand } from '../init'
import { ConfigCommand, createConfigCommand } from '../config'

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    success: () => {},
    update: () => {},
    startSpinner: () => {},
    stopSpinner: () => {},
    raw: () => {},
    setLogLevel: () => {},
  }
}

function createMockContext(tmpDir: string): CommandContext {
  const fs = {
    existsSync: (path: string) => require('fs').existsSync(path),
    readFileSync: (path: string, encoding?: string) => require('fs').readFileSync(path, encoding),
    writeFileSync: (path: string, content: string) => require('fs').writeFileSync(path, content),
    readdirSync: (path: string) => require('fs').readdirSync(path),
    mkdirSync: (path: string, options?: { recursive?: boolean }) => require('fs').mkdirSync(path, options),
  }

  const path = {
    join: (...paths: string[]) => require('path').join(...paths),
    dirname: (path: string) => require('path').dirname(path),
    basename: (path: string) => require('path').basename(path),
    relative: (from: string, to: string) => require('path').relative(from, to),
  }

  const processUtils = {
    cwd: () => tmpDir,
    exit: () => {},
    env: () => ({}),
    isCI: () => false,
    isTTY: () => false,
  }

  return {
    logger: createMockLogger(),
    fs,
    path,
    process: processUtils,
  }
}

describe('InitCommand', () => {
  test('should have correct name', () => {
    const command = createInitCommand()
    expect(command.name).toBe('init')
  })

  test('should have description', () => {
    const command = createInitCommand()
    expect(command.description).toBeDefined()
    expect(typeof command.description).toBe('string')
  })

  test('should have usage', () => {
    const command = createInitCommand()
    expect(command.usage).toBe('[options]')
  })

  test('should have examples', () => {
    const command = createInitCommand()
    expect(command.examples).toBeDefined()
    expect(Array.isArray(command.examples)).toBe(true)
    expect(command.examples!.length).toBeGreaterThan(0)
  })

  test('should have seeAlso', () => {
    const command = createInitCommand()
    expect(command.seeAlso).toBeDefined()
    expect(command.seeAlso).toContain('loopwork run')
  })

  test('validate should return undefined for valid options', () => {
    const command = new InitCommand()
    const result = command.validate!({})
    expect(result).toBeUndefined()
  })

  test('validate should return error for invalid backendType', () => {
    const command = new InitCommand()
    const result = command.validate!({ backendType: 'invalid' })
    expect(result).toBeDefined()
    expect(result).toContain('backendType')
  })

  test('validate should return error for invalid aiTool', () => {
    const command = new InitCommand()
    const result = command.validate!({ aiTool: 'invalid' })
    expect(result).toBeDefined()
    expect(result).toContain('aiTool')
  })

  test('validate should return error for invalid dailyBudget', () => {
    const command = new InitCommand()
    const result = command.validate!({ dailyBudget: -10 })
    expect(result).toBeDefined()
    expect(result).toContain('dailyBudget')
  })
})

describe('ConfigCommand', () => {
  test('should have correct name', () => {
    const command = createConfigCommand()
    expect(command.name).toBe('config')
  })

  test('should have description', () => {
    const command = createConfigCommand()
    expect(command.description).toBeDefined()
    expect(typeof command.description).toBe('string')
  })

  test('should have usage', () => {
    const command = createConfigCommand()
    expect(command.usage).toBe('[options]')
  })

  test('should have examples', () => {
    const command = createConfigCommand()
    expect(command.examples).toBeDefined()
    expect(Array.isArray(command.examples)).toBe(true)
    expect(command.examples!.length).toBeGreaterThan(0)
  })

  test('validate should return undefined for valid options', () => {
    const command = new ConfigCommand()
    const result = command.validate!({})
    expect(result).toBeUndefined()
  })

  test('validate should return error for invalid format', () => {
    const command = new ConfigCommand()
    const result = command.validate!({ format: 'invalid' })
    expect(result).toBeDefined()
    expect(result).toContain('format')
  })

  test('validate should return error for invalid configPath type', () => {
    const command = new ConfigCommand()
    const result = command.validate!({ configPath: 123 })
    expect(result).toBeDefined()
    expect(result).toContain('configPath')
  })
})

describe('Module exports', () => {
  test('should export InitCommand', () => {
    expect(InitCommand).toBeDefined()
    expect(typeof InitCommand).toBe('function')
  })

  test('should export createInitCommand', () => {
    expect(createInitCommand).toBeDefined()
    expect(typeof createInitCommand).toBe('function')
  })

  test('should export ConfigCommand', () => {
    expect(ConfigCommand).toBeDefined()
    expect(typeof ConfigCommand).toBe('function')
  })

  test('should export createConfigCommand', () => {
    expect(createConfigCommand).toBeDefined()
    expect(typeof createConfigCommand).toBe('function')
  })
})
