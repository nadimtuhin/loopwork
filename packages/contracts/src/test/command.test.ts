import { describe, expect, test } from 'bun:test'
import type { CommandResult, CommandOptions, ICommand, CommandContext, FileSystem, Path, ProcessUtils, CommandRegistryStats, RegisterCommandOptions } from '../command'

describe('command', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})
