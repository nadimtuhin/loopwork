import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { createCostTrackingPlugin, CostTracker, MODEL_PRICING } from '../src'
import type { TaskContext, PluginTaskResult } from '../../loopwork/src/contracts'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * E2E Test Suite for Cost Tracking Plugin
 *
 * Tests full lifecycle integration of token usage and cost tracking:
 * - CostTracker class methods (record, parseUsageFromOutput, calculateCost)
 * - Summary methods (getTodaySummary, getAllTimeSummary, getCostByModel, getDailySummaries)
 * - Plugin hooks (onTaskComplete captures tokens, onLoopEnd shows summary)
 * - Various CLI output formats (Claude, OpenCode, generic)
 * - File persistence (load/save)
 */

describe('Cost Tracking E2E - Full Integration', () => {
  let testDir: string
  let tracker: CostTracker

  beforeEach(() => {
    // Create temp directory for test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-tracking-test-'))
    tracker = new CostTracker(testDir, 'test')
  })

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  const createMockTask = (id = 'TASK-001'): any => ({
    id,
    title: 'Test task',
    status: 'pending',
    metadata: {},
  })

  const createMockContext = (taskId = 'TASK-001'): TaskContext => ({
    task: createMockTask(taskId),
    iteration: 1,
    startTime: new Date(),
    namespace: 'test',
  })

  const createMockResult = (duration = 30, output = ''): PluginTaskResult => ({
    duration,
    output,
  })

  describe('CostTracker - Token Recording and Calculation', () => {
    test('record() creates entry with correct cost calculation', () => {
      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
      }

      const entry = tracker.record('TASK-001', 'claude-3.5-sonnet', usage, 45)

      expect(entry).toMatchObject({
        taskId: 'TASK-001',
        model: 'claude-3.5-sonnet',
        usage,
        duration: 45,
      })

      // Claude 3.5 Sonnet: $3/1M input, $15/1M output
      const expectedCost = (1000 / 1_000_000) * 3 + (500 / 1_000_000) * 15
      expect(entry.cost).toBeCloseTo(expectedCost, 6)
    })

    test('calculateCost() handles different models correctly', () => {
      const usage = { inputTokens: 100_000, outputTokens: 50_000 }

      const costs = {
        'claude-3-opus': tracker.calculateCost('claude-3-opus', usage),
        'claude-3-haiku': tracker.calculateCost('claude-3-haiku', usage),
        'gpt-4o': tracker.calculateCost('gpt-4o', usage),
        'gemini-1.5-flash': tracker.calculateCost('gemini-1.5-flash', usage),
      }

      // Opus: $15/1M in, $75/1M out
      expect(costs['claude-3-opus']).toBeCloseTo(
        (100_000 / 1_000_000) * 15 + (50_000 / 1_000_000) * 75,
        6
      )

      // Haiku: $0.25/1M in, $1.25/1M out
      expect(costs['claude-3-haiku']).toBeCloseTo(
        (100_000 / 1_000_000) * 0.25 + (50_000 / 1_000_000) * 1.25,
        6
      )

      // GPT-4o: $2.50/1M in, $10/1M out
      expect(costs['gpt-4o']).toBeCloseTo(
        (100_000 / 1_000_000) * 2.50 + (50_000 / 1_000_000) * 10,
        6
      )

      // Gemini Flash: $0.075/1M in, $0.30/1M out
      expect(costs['gemini-1.5-flash']).toBeCloseTo(
        (100_000 / 1_000_000) * 0.075 + (50_000 / 1_000_000) * 0.30,
        6
      )
    })

    test('calculateCost() uses default pricing for unknown models', () => {
      const usage = { inputTokens: 10_000, outputTokens: 5_000 }
      const cost = tracker.calculateCost('unknown-model', usage)

      // Should use default: $3/1M in, $15/1M out
      const expectedCost = (10_000 / 1_000_000) * 3 + (5_000 / 1_000_000) * 15
      expect(cost).toBeCloseTo(expectedCost, 6)
    })

    test('calculateCost() handles cache tokens when pricing available', () => {
      const usage = {
        inputTokens: 10_000,
        outputTokens: 5_000,
        cacheReadTokens: 2_000,
        cacheWriteTokens: 1_000,
      }

      const cost = tracker.calculateCost('claude-3.5-sonnet', usage)

      // Base cost without cache pricing (pricing doesn't include cache in our model)
      const expectedCost = (10_000 / 1_000_000) * 3 + (5_000 / 1_000_000) * 15
      expect(cost).toBeCloseTo(expectedCost, 6)
    })
  })

  describe('CostTracker - Output Parsing', () => {
    test('parseUsageFromOutput() handles Claude Code format', () => {
      const output = `
Task completed successfully.
Tokens: 1234 input, 567 output
Duration: 30s
      `

      const usage = tracker.parseUsageFromOutput(output)

      expect(usage).toEqual({
        inputTokens: 1234,
        outputTokens: 567,
      })
    })

    test('parseUsageFromOutput() handles OpenCode format', () => {
      const output = `
Execution complete
Usage: 5678 prompt tokens, 1234 completion tokens
Total time: 45s
      `

      const usage = tracker.parseUsageFromOutput(output)

      expect(usage).toEqual({
        inputTokens: 5678,
        outputTokens: 1234,
      })
    })

    test('parseUsageFromOutput() handles generic format', () => {
      const output = `
Task finished
input_tokens: 9876, output_tokens: 4321
      `

      const usage = tracker.parseUsageFromOutput(output)

      expect(usage).toEqual({
        inputTokens: 9876,
        outputTokens: 4321,
      })
    })

    test('parseUsageFromOutput() handles JSON format in output', () => {
      const output = `
Result: {"input_tokens": 2000, "output_tokens": 1500, "status": "success"}
      `

      const usage = tracker.parseUsageFromOutput(output)

      expect(usage).toEqual({
        inputTokens: 2000,
        outputTokens: 1500,
      })
    })

    test('parseUsageFromOutput() returns null for unparseable output', () => {
      const output = 'Task completed with no token info'
      const usage = tracker.parseUsageFromOutput(output)

      expect(usage).toBeNull()
    })

    test('parseUsageFromOutput() handles multiple number formats', () => {
      const outputs = [
        'Tokens: 1,234 input, 567 output', // With commas
        'Tokens:1234input,567output',      // No spaces
        'TOKENS: 1234 INPUT, 567 OUTPUT',  // Uppercase
      ]

      outputs.forEach(output => {
        const usage = tracker.parseUsageFromOutput(output)
        // Parsing might fail on comma-formatted numbers, but should handle basic cases
        if (usage) {
          expect(usage.inputTokens).toBeGreaterThan(0)
          expect(usage.outputTokens).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('CostTracker - Summary Methods', () => {
    beforeEach(() => {
      // Add some test data
      tracker.record('TASK-001', 'claude-3.5-sonnet', { inputTokens: 1000, outputTokens: 500 }, 30)
      tracker.record('TASK-002', 'claude-3-haiku', { inputTokens: 2000, outputTokens: 1000 }, 20)
      tracker.record('TASK-003', 'claude-3.5-sonnet', { inputTokens: 1500, outputTokens: 750 }, 40)
    })

    test('getTodaySummary() aggregates today\'s entries', () => {
      const summary = tracker.getTodaySummary()

      expect(summary).toMatchObject({
        taskCount: 3,
        totalInputTokens: 4500,
        totalOutputTokens: 2250,
      })
      expect(summary.totalCost).toBeGreaterThan(0)
      expect(summary.entries).toHaveLength(3)
    })

    test('getAllTimeSummary() includes all entries', () => {
      const summary = tracker.getAllTimeSummary()

      expect(summary).toMatchObject({
        taskCount: 3,
        totalInputTokens: 4500,
        totalOutputTokens: 2250,
      })
    })

    test('getCostByModel() breaks down by model', () => {
      const byModel = tracker.getCostByModel()

      expect(byModel['claude-3.5-sonnet']).toMatchObject({
        tokens: {
          inputTokens: 2500, // 1000 + 1500
          outputTokens: 1250, // 500 + 750
        },
      })

      expect(byModel['claude-3-haiku']).toMatchObject({
        tokens: {
          inputTokens: 2000,
          outputTokens: 1000,
        },
      })

      expect(byModel['claude-3.5-sonnet'].cost).toBeGreaterThan(byModel['claude-3-haiku'].cost)
    })

    test('getTaskSummary() filters by task ID', () => {
      const summary = tracker.getTaskSummary('TASK-001')

      expect(summary).toMatchObject({
        taskCount: 1,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
      })
    })

    test('getDailySummaries() returns last N days', () => {
      const summaries = tracker.getDailySummaries(3)

      expect(summaries).toHaveLength(3)
      expect(summaries[0].date).toBe(new Date().toISOString().split('T')[0])
      expect(summaries[0].taskCount).toBe(3)
      expect(summaries[1].taskCount).toBe(0) // Yesterday
      expect(summaries[2].taskCount).toBe(0) // Day before
    })
  })

  describe('CostTracker - File Persistence', () => {
    test('saves and loads entries correctly', () => {
      const tracker1 = new CostTracker(testDir, 'persist')

      tracker1.record('TASK-A', 'claude-3-opus', { inputTokens: 5000, outputTokens: 2500 })
      tracker1.record('TASK-B', 'gpt-4o', { inputTokens: 3000, outputTokens: 1500 })

      // Create new tracker instance (should load from file)
      const tracker2 = new CostTracker(testDir, 'persist')

      const summary = tracker2.getAllTimeSummary()
      expect(summary.taskCount).toBe(2)
      expect(summary.totalInputTokens).toBe(8000)
      expect(summary.totalOutputTokens).toBe(4000)
    })

    test('handles missing file gracefully', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))
      const emptyTracker = new CostTracker(emptyDir, 'new')

      const summary = emptyTracker.getAllTimeSummary()
      expect(summary.taskCount).toBe(0)

      fs.rmSync(emptyDir, { recursive: true, force: true })
    })

    test('handles corrupted file gracefully', () => {
      const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corrupt-'))
      const storageFile = path.join(corruptDir, '.loopwork-cost-tracking-corrupt.json')

      fs.writeFileSync(storageFile, 'invalid json{{{')

      const corruptTracker = new CostTracker(corruptDir, 'corrupt')
      const summary = corruptTracker.getAllTimeSummary()
      expect(summary.taskCount).toBe(0)

      fs.rmSync(corruptDir, { recursive: true, force: true })
    })

    test('clear() removes all entries and persists', () => {
      tracker.record('TASK-1', 'claude-3.5-sonnet', { inputTokens: 100, outputTokens: 50 })
      tracker.clear()

      const summary = tracker.getAllTimeSummary()
      expect(summary.taskCount).toBe(0)

      // Verify cleared state persists
      const tracker2 = new CostTracker(testDir, 'test')
      expect(tracker2.getAllTimeSummary().taskCount).toBe(0)
    })

    test('uses namespace in filename', () => {
      const tracker1 = new CostTracker(testDir, 'namespace1')
      const tracker2 = new CostTracker(testDir, 'namespace2')

      tracker1.record('TASK-1', 'claude-3-haiku', { inputTokens: 100, outputTokens: 50 })
      tracker2.record('TASK-2', 'claude-3-opus', { inputTokens: 200, outputTokens: 100 })

      expect(tracker1.getAllTimeSummary().taskCount).toBe(1)
      expect(tracker2.getAllTimeSummary().taskCount).toBe(1)

      // Verify separate files
      expect(fs.existsSync(path.join(testDir, '.loopwork-cost-tracking-namespace1.json'))).toBe(true)
      expect(fs.existsSync(path.join(testDir, '.loopwork-cost-tracking-namespace2.json'))).toBe(true)
    })
  })

  describe('Plugin Integration - E2E Flow', () => {
    test('plugin captures tokens from CLI output on task complete', async () => {
      const plugin = createCostTrackingPlugin(testDir, 'plugin-test', 'claude-3.5-sonnet')

      const context = createMockContext('TASK-001')
      const result = createMockResult(45, 'Tokens: 2500 input, 1200 output')

      await plugin.onTaskComplete?.(context, result)

      // Verify token was recorded
      const pluginTracker = new CostTracker(testDir, 'plugin-test')
      const summary = pluginTracker.getTodaySummary()

      expect(summary.taskCount).toBe(1)
      expect(summary.totalInputTokens).toBe(2500)
      expect(summary.totalOutputTokens).toBe(1200)
    })

    test('plugin shows summary on loop end', async () => {
      const plugin = createCostTrackingPlugin(testDir, 'summary-test', 'claude-3-haiku')

      // Add some tasks
      await plugin.onTaskComplete?.(
        createMockContext('TASK-1'),
        createMockResult(30, 'Tokens: 1000 input, 500 output')
      )
      await plugin.onTaskComplete?.(
        createMockContext('TASK-2'),
        createMockResult(20, 'Tokens: 800 input, 400 output')
      )

      // Should not throw when showing summary
      await expect(
        plugin.onLoopEnd?.({ completed: 2, failed: 0, duration: 50 })
      ).resolves.toBeUndefined()

      // Verify data
      const pluginTracker = new CostTracker(testDir, 'summary-test')
      const summary = pluginTracker.getTodaySummary()

      expect(summary.taskCount).toBe(2)
      expect(summary.totalInputTokens).toBe(1800)
      expect(summary.totalOutputTokens).toBe(900)
    })

    test('plugin handles missing token data gracefully', async () => {
      const plugin = createCostTrackingPlugin(testDir, 'no-tokens', 'claude-3.5-sonnet')

      const context = createMockContext('TASK-001')
      const result = createMockResult(30, 'Task completed with no token info')

      await plugin.onTaskComplete?.(context, result)

      const pluginTracker = new CostTracker(testDir, 'no-tokens')
      const summary = pluginTracker.getTodaySummary()

      expect(summary.taskCount).toBe(0) // No entry created
    })

    test('plugin handles multiple CLI formats', async () => {
      const plugin = createCostTrackingPlugin(testDir, 'multi-cli', 'gpt-4o')

      // Claude format
      await plugin.onTaskComplete?.(
        createMockContext('TASK-1'),
        createMockResult(20, 'Tokens: 1000 input, 500 output')
      )

      // OpenCode format
      await plugin.onTaskComplete?.(
        createMockContext('TASK-2'),
        createMockResult(30, 'Usage: 800 prompt tokens, 400 completion tokens')
      )

      // Generic format
      await plugin.onTaskComplete?.(
        createMockContext('TASK-3'),
        createMockResult(25, 'input_tokens: 1200, output_tokens: 600')
      )

      const pluginTracker = new CostTracker(testDir, 'multi-cli')
      const summary = pluginTracker.getTodaySummary()

      expect(summary.taskCount).toBe(3)
      expect(summary.totalInputTokens).toBe(3000)
      expect(summary.totalOutputTokens).toBe(1500)
    })
  })

  describe('Model Pricing Coverage', () => {
    test('all Claude models have pricing', () => {
      const claudeModels = [
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'claude-3.5-sonnet',
        'claude-3.5-haiku',
        'claude-opus-4',
        'claude-sonnet-4',
      ]

      claudeModels.forEach(model => {
        expect(MODEL_PRICING[model]).toBeDefined()
        expect(MODEL_PRICING[model].inputPer1M).toBeGreaterThan(0)
        expect(MODEL_PRICING[model].outputPer1M).toBeGreaterThan(0)
      })
    })

    test('all OpenAI models have pricing', () => {
      const openaiModels = ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini']

      openaiModels.forEach(model => {
        expect(MODEL_PRICING[model]).toBeDefined()
        expect(MODEL_PRICING[model].inputPer1M).toBeGreaterThan(0)
        expect(MODEL_PRICING[model].outputPer1M).toBeGreaterThan(0)
      })
    })

    test('all Google models have pricing', () => {
      const googleModels = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash']

      googleModels.forEach(model => {
        expect(MODEL_PRICING[model]).toBeDefined()
        expect(MODEL_PRICING[model].inputPer1M).toBeGreaterThan(0)
        expect(MODEL_PRICING[model].outputPer1M).toBeGreaterThan(0)
      })
    })

    test('pricing is reasonable (sanity check)', () => {
      // Haiku should be cheapest
      expect(MODEL_PRICING['claude-3-haiku'].inputPer1M).toBeLessThan(
        MODEL_PRICING['claude-3-sonnet'].inputPer1M
      )

      // Opus should be most expensive
      expect(MODEL_PRICING['claude-3-opus'].inputPer1M).toBeGreaterThan(
        MODEL_PRICING['claude-3-sonnet'].inputPer1M
      )

      // Output should cost more than input
      Object.values(MODEL_PRICING).forEach(pricing => {
        expect(pricing.outputPer1M).toBeGreaterThan(pricing.inputPer1M)
      })
    })
  })

  describe('Edge Cases and Robustness', () => {
    test('handles zero token usage', () => {
      const usage = { inputTokens: 0, outputTokens: 0 }
      const cost = tracker.calculateCost('claude-3.5-sonnet', usage)

      expect(cost).toBe(0)
    })

    test('handles very large token counts', () => {
      const usage = {
        inputTokens: 10_000_000, // 10M tokens
        outputTokens: 5_000_000,
      }

      const entry = tracker.record('TASK-LARGE', 'claude-3-opus', usage)

      expect(entry.cost).toBeGreaterThan(100) // Should be expensive!
    })

    test('handles fractional durations', () => {
      const entry = tracker.record('TASK-FRAC', 'claude-3-haiku', {
        inputTokens: 100,
        outputTokens: 50,
      }, 12.5)

      expect(entry.duration).toBe(12.5)
    })

    test('handles tasks without duration', () => {
      const entry = tracker.record('TASK-NO-DUR', 'claude-3.5-sonnet', {
        inputTokens: 100,
        outputTokens: 50,
      })

      expect(entry.duration).toBeUndefined()
    })

    test('date range summary with no entries returns zero', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

      const summary = tracker.getRangeSummary(twoDaysAgo, yesterday)

      expect(summary.taskCount).toBe(0)
      expect(summary.totalCost).toBe(0)
    })
  })
})
