import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { Dashboard } from '../src/dashboard/cli'

const TEST_DIR = path.join(import.meta.dir, 'fixtures', 'dashboard-test')

describe('Dashboard state parsing', () => {
  beforeEach(() => {
    // Create test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  test('parses current state format using StateManager', () => {
    // Create a state file in current format
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const stateContent = [
      'NAMESPACE=default',
      'LAST_ISSUE=123',
      'LAST_ITERATION=5',
      'LAST_OUTPUT_DIR=.loopwork/runs/default/session-001',
      'SESSION_ID=session-001',
      'SAVED_AT=2024-01-01T00:00:00.000Z',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    expect(stats.currentTask).toBe('Task #123')
    expect(stats.iterations).toBe(5)
  })

  test('parses namespaced state files', () => {
    // Create a namespaced state file
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state-custom.json')
    const stateContent = [
      'NAMESPACE=custom',
      'LAST_ISSUE=456',
      'LAST_ITERATION=10',
      'LAST_OUTPUT_DIR=.loopwork/runs/custom/session-002',
      'SESSION_ID=session-002',
      'SAVED_AT=2024-01-01T00:00:00.000Z',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('custom')

    expect(stats.currentTask).toBe('Task #456')
    expect(stats.iterations).toBe(10)
  })

  test('handles missing state file gracefully', () => {
    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('nonexistent')

    expect(stats.currentTask).toBeUndefined()
    expect(stats.iterations).toBe(0)
  })

  test('falls back to legacy format when StateManager fails', () => {
    // Create a legacy state file (minimal format)
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const legacyContent = [
      'LAST_ISSUE=789',
      'LAST_ITERATION=3',
    ].join('\n')

    fs.writeFileSync(stateFile, legacyContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    expect(stats.currentTask).toBe('Task #789')
    expect(stats.iterations).toBe(3)
  })

  test('handles malformed state file gracefully', () => {
    // Create a malformed state file
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    fs.writeFileSync(stateFile, 'invalid content without equals signs')

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    expect(stats.currentTask).toBeUndefined()
    expect(stats.iterations).toBe(0)
  })

  test('handles state file with missing LAST_ISSUE', () => {
    // Create a state file missing LAST_ISSUE
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const stateContent = [
      'NAMESPACE=default',
      'LAST_ITERATION=5',
      'SESSION_ID=session-001',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    expect(stats.currentTask).toBeUndefined()
    expect(stats.iterations).toBe(0)
  })

  test('handles state file with missing LAST_ITERATION', () => {
    // Create a state file missing LAST_ITERATION
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const stateContent = [
      'NAMESPACE=default',
      'LAST_ISSUE=100',
      'SESSION_ID=session-001',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    expect(stats.currentTask).toBe('Task #100')
    expect(stats.iterations).toBe(0) // Should default to 0
  })

  test('handles non-numeric values in state file', () => {
    // Create a state file with non-numeric values
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const stateContent = [
      'NAMESPACE=default',
      'LAST_ISSUE=not-a-number',
      'LAST_ITERATION=also-not-a-number',
      'SESSION_ID=session-001',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    // parseInt returns NaN for invalid numbers
    expect(isNaN(stats.iterations)).toBe(true)
  })

  test('handles state file with extra whitespace', () => {
    // Create a state file with extra whitespace
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const stateContent = [
      '  NAMESPACE=default  ',
      '  LAST_ISSUE=200  ',
      '  LAST_ITERATION=7  ',
      '  LAST_OUTPUT_DIR=.loopwork/runs/default/session-001  ',
      '  SESSION_ID=session-001  ',
      '  SAVED_AT=2024-01-01T00:00:00.000Z  ',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    // Should handle whitespace gracefully
    expect(stats.currentTask).toBe('Task #200')
    expect(stats.iterations).toBe(7)
  })

  test('handles empty state file', () => {
    // Create an empty state file
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    fs.writeFileSync(stateFile, '')

    const dashboard = new Dashboard(TEST_DIR)
    const stats = (dashboard as any).getNamespaceStats('default')

    expect(stats.currentTask).toBeUndefined()
    expect(stats.iterations).toBe(0)
  })

  test('loadStateForNamespace returns null when no state exists', () => {
    const dashboard = new Dashboard(TEST_DIR)
    const state = (dashboard as any).loadStateForNamespace('default')

    expect(state).toBeNull()
  })

  test('loadStateForNamespace returns correct data when state exists', () => {
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    const stateContent = [
      'NAMESPACE=default',
      'LAST_ISSUE=999',
      'LAST_ITERATION=15',
      'SESSION_ID=session-001',
    ].join('\n')

    fs.writeFileSync(stateFile, stateContent)

    const dashboard = new Dashboard(TEST_DIR)
    const state = (dashboard as any).loadStateForNamespace('default')

    expect(state).not.toBeNull()
    expect(state?.lastIssue).toBe(999)
    expect(state?.lastIteration).toBe(15)
  })

  test('loadStateLegacy handles various formats', () => {
    const dashboard = new Dashboard(TEST_DIR)

    // Test with minimal legacy format
    const stateDir = path.join(TEST_DIR, '.loopwork')
    fs.mkdirSync(stateDir, { recursive: true })
    const stateFile = path.join(stateDir, 'state.json')
    fs.writeFileSync(stateFile, 'LAST_ISSUE=111\nLAST_ITERATION=2')

    const state = (dashboard as any).loadStateLegacy('default')

    expect(state).not.toBeNull()
    expect(state?.lastIssue).toBe(111)
    expect(state?.lastIteration).toBe(2)
  })

  test('loadStateLegacy returns null for non-existent file', () => {
    const dashboard = new Dashboard(TEST_DIR)
    const state = (dashboard as any).loadStateLegacy('nonexistent')

    expect(state).toBeNull()
  })
})
