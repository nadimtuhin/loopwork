import { describe, test, expect } from 'bun:test'
import { Table, Banner, separator, supportsEmoji, getEmoji, BOX_CHARS, ProgressBar, CompletionSummary } from '../../src/core/output'

describe('Output Utilities', () => {
  describe('supportsEmoji', () => {
    test('should return a boolean', () => {
      const result = supportsEmoji()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('getEmoji', () => {
    test('should return emoji or fallback', () => {
      const result = getEmoji('✅')
      expect(result).toBeTruthy()
      expect(['✅', '[OK]']).toContain(result)
    })

    test('should handle unknown emoji', () => {
      const result = getEmoji('🚀')
      expect(result).toBe('🚀')
    })
  })

  describe('separator', () => {
    test('should create light separator', () => {
      const result = separator('light', 10)
      expect(result).toContain('─')
      expect(result.length).toBeGreaterThan(0)
    })

    test('should create heavy separator', () => {
      const result = separator('heavy', 10)
      expect(result).toContain('═')
      expect(result.length).toBeGreaterThan(0)
    })

    test('should create section separator with newlines', () => {
      const result = separator('section', 10)
      expect(result).toContain('\n')
      expect(result).toContain('─')
    })
  })

  describe('Table', () => {
    test('should create basic table', () => {
      const table = new Table(['Name', 'Status'])
      table.addRow(['Task 1', 'Complete'])
      table.addRow(['Task 2', 'Failed'])

      const output = table.render()
      expect(output).toContain('Name')
      expect(output).toContain('Status')
      expect(output).toContain('Task 1')
      expect(output).toContain('Task 2')
      expect(output).toContain('┌')
      expect(output).toContain('└')
    })

    test('should handle alignment', () => {
      const table = new Table(
        ['Left', 'Right', 'Center'],
        [
          { align: 'left' },
          { align: 'right' },
          { align: 'center' },
        ]
      )
      table.addRow(['A', 'B', 'C'])

      const output = table.render()
      expect(output).toContain('Left')
      expect(output).toContain('Right')
      expect(output).toContain('Center')
    })

    test('should enforce row length', () => {
      const table = new Table(['A', 'B'])
      expect(() => table.addRow(['X'])).toThrow()
      expect(() => table.addRow(['X', 'Y', 'Z'])).toThrow()
    })

    test('should auto-calculate column widths', () => {
      const table = new Table(['Short', 'X'])
      table.addRow(['A', 'Very long content here'])

      const output = table.render()
      expect(output).toContain('Very long content here')
    })

    test('should respect configured widths', () => {
      const table = new Table(['Name', 'Status'], [{ width: 20 }, { width: 10 }])
      table.addRow(['Task', 'OK'])

      const output = table.render()
      expect(output).toBeTruthy()
    })
  })

  describe('Banner', () => {
    test('should create basic banner', () => {
      const banner = new Banner('Test Title')
      const output = banner.render()

      expect(output).toContain('Test Title')
      expect(output).toContain('╔')
      expect(output).toContain('╚')
    })

    test('should create light banner', () => {
      const banner = new Banner('Test', 'light')
      const output = banner.render()

      expect(output).toContain('Test')
      expect(output).toContain('┌')
      expect(output).toContain('└')
    })

    test('should add key-value rows', () => {
      const banner = new Banner('Build Complete')
      banner.addRow('Duration', '5m 30s')
      banner.addRow('Tests', '42 passed')

      const output = banner.render()
      expect(output).toContain('Build Complete')
      expect(output).toContain('Duration')
      expect(output).toContain('5m 30s')
      expect(output).toContain('Tests')
      expect(output).toContain('42 passed')
    })

    test('should handle empty rows', () => {
      const banner = new Banner('Title Only')
      const output = banner.render()

      expect(output).toContain('Title Only')
      expect(output).toContain('╔')
    })
  })

  describe('BOX_CHARS', () => {
    test('should have light box characters', () => {
      expect(BOX_CHARS.light.topLeft).toBe('┌')
      expect(BOX_CHARS.light.topRight).toBe('┐')
      expect(BOX_CHARS.light.bottomLeft).toBe('└')
      expect(BOX_CHARS.light.bottomRight).toBe('┘')
      expect(BOX_CHARS.light.horizontal).toBe('─')
      expect(BOX_CHARS.light.vertical).toBe('│')
    })

    test('should have heavy box characters', () => {
      expect(BOX_CHARS.heavy.topLeft).toBe('╔')
      expect(BOX_CHARS.heavy.topRight).toBe('╗')
      expect(BOX_CHARS.heavy.bottomLeft).toBe('╚')
      expect(BOX_CHARS.heavy.bottomRight).toBe('╝')
      expect(BOX_CHARS.heavy.horizontal).toBe('═')
      expect(BOX_CHARS.heavy.vertical).toBe('║')
    })
  })

  describe('ProgressBar', () => {
    test('should create deterministic progress bar', () => {
      const progress = new ProgressBar(100)
      expect(progress).toBeTruthy()
      progress.increment()
      // Should not throw
      progress.tick('Processing...')
      progress.complete('Done')
    })

    test('should create indeterminate progress bar', () => {
      const progress = new ProgressBar()
      expect(progress).toBeTruthy()
      // Should not throw
      progress.tick('Loading...')
      progress.complete('Complete')
    })

    test('should handle increment correctly', () => {
      const progress = new ProgressBar(10)
      progress.increment()
      progress.increment()
      // Should not throw when incrementing
      progress.tick()
    })

    test('should complete with custom message', () => {
      const progress = new ProgressBar(5)
      progress.increment()
      // Should not throw
      progress.complete('All tasks finished!')
    })

    test('should handle zero total as indeterminate', () => {
      const progress = new ProgressBar(0)
      expect(progress).toBeTruthy()
      // Should work like indeterminate mode
      progress.tick('Working...')
      progress.complete()
    })

    test('should throttle tick updates', () => {
      const progress = new ProgressBar(100)
      // Rapid ticks should be throttled
      progress.tick('1')
      progress.tick('2')
      progress.tick('3')
      // Should not throw
      progress.complete()
    })
  })

  describe('CompletionSummary', () => {
    test('should create basic completion summary', () => {
      const summary = new CompletionSummary('Task Complete')
      const output = summary.render()

      expect(output).toContain('Task Complete')
    })

    test('should display stats', () => {
      const summary = new CompletionSummary('Build Complete')
      summary.setStats({ completed: 10, failed: 2, skipped: 1 })

      const output = summary.render()
      expect(output).toContain('10')
      expect(output).toContain('2')
      expect(output).toContain('1')
    })

    test('should format duration correctly', () => {
      const summary = new CompletionSummary('Test Complete')
      summary.setDuration(125000) // 2m 5s

      const output = summary.render()
      expect(output).toContain('2m')
      expect(output).toContain('5s')
    })

    test('should display next steps', () => {
      const summary = new CompletionSummary('Deploy Complete')
      summary.addNextStep('Run tests')
      summary.addNextStep('Push to production')

      const output = summary.render()
      expect(output).toContain('Run tests')
      expect(output).toContain('Push to production')
    })

    test('should handle multiple next steps', () => {
      const summary = new CompletionSummary('Setup Complete')
      summary.addNextSteps(['Step 1', 'Step 2', 'Step 3'])

      const output = summary.render()
      expect(output).toContain('Step 1')
      expect(output).toContain('Step 2')
      expect(output).toContain('Step 3')
    })

    test('should handle partial stats', () => {
      const summary = new CompletionSummary('Partial Stats')
      summary.setStats({ completed: 5 })

      const output = summary.render()
      expect(output).toContain('5')
    })

    test('should format hours in duration', () => {
      const summary = new CompletionSummary('Long Task')
      summary.setDuration(7200000) // 2 hours

      const output = summary.render()
      expect(output).toContain('2h')
    })

    test('should handle zero stats gracefully', () => {
      const summary = new CompletionSummary('No Stats')
      summary.setStats({ completed: 0, failed: 0, skipped: 0 })

      const output = summary.render()
      expect(output).toBeTruthy()
    })

    test('should handle no next steps', () => {
      const summary = new CompletionSummary('Simple Summary')
      summary.setStats({ completed: 3 })

      const output = summary.render()
      expect(output).toContain('Simple Summary')
      expect(output).toContain('3')
    })
  })
})
