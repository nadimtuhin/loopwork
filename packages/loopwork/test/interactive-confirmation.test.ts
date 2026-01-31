import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test'
import { InteractiveConfirmation } from '../src/safety/interactive-confirmation'
import { RiskLevel } from '../src/contracts/safety'

// Mock process.stdin and process.stdout
const mockIsTTY = { value: true }
const mockStdin = {
  isTTY: true,
  on: () => {}
}
const mockStdout = {
  isTTY: true,
  write: () => {}
}

describe('InteractiveConfirmation', () => {
  let confirmation: InteractiveConfirmation

  beforeEach(() => {
    // Reset environment
    delete process.env.LOOPWORK_DEBUG
    delete process.env.LOOPWORK_NON_INTERACTIVE
    delete process.env.CI

    // Remove any command-line flags
    const indexYes = process.argv.indexOf('-y')
    if (indexYes !== -1) process.argv.splice(indexYes, 1)
    const indexYesLong = process.argv.indexOf('--yes')
    if (indexYesLong !== -1) process.argv.splice(indexYesLong, 1)

    // Reset TTY mock
    mockIsTTY.value = true

    confirmation = new InteractiveConfirmation(30000)
  })

  describe('constructor', () => {
    test('should create confirmation with default timeout', () => {
      const conf = new InteractiveConfirmation()
      expect(conf).toBeInstanceOf(InteractiveConfirmation)
    })

    test('should create confirmation with custom timeout', () => {
      const conf = new InteractiveConfirmation(60000)
      expect(conf).toBeInstanceOf(InteractiveConfirmation)
    })
  })

  describe('confirm', () => {
    test('should auto-confirm in non-interactive mode (env var)', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const result = await confirmation.confirm({
        taskId: 'TASK-001',
        title: 'Test task',
        riskLevel: RiskLevel.HIGH,
        reasons: ['Dangerous operation'],
      })

      expect(result.confirmed).toBe(true)
      expect(result.timedOut).toBe(false)
      expect(result.nonInteractive).toBe(true)
    })

    test('should auto-confirm in CI mode', async () => {
      process.env.CI = 'true'

      const result = await confirmation.confirm({
        taskId: 'TASK-002',
        title: 'Test task',
        riskLevel: RiskLevel.HIGH,
        reasons: ['Dangerous operation'],
      })

      expect(result.confirmed).toBe(true)
      expect(result.timedOut).toBe(false)
      expect(result.nonInteractive).toBe(true)
    })

    test('should auto-confirm with -y flag', async () => {
      // Mock process.argv to include -y
      const originalArgv = process.argv
      process.argv = [...process.argv, '-y']

      try {
        const result = await confirmation.confirm({
          taskId: 'TASK-003',
          title: 'Test task',
          riskLevel: RiskLevel.HIGH,
          reasons: ['Dangerous operation'],
        })

        expect(result.confirmed).toBe(true)
        expect(result.timedOut).toBe(false)
        expect(result.nonInteractive).toBe(true)
      } finally {
        process.argv = originalArgv
      }
    })

    test('should auto-confirm with --yes flag', async () => {
      // Mock process.argv to include --yes
      const originalArgv = process.argv
      process.argv = [...process.argv, '--yes']

      try {
        const result = await confirmation.confirm({
          taskId: 'TASK-004',
          title: 'Test task',
          riskLevel: RiskLevel.HIGH,
          reasons: ['Dangerous operation'],
        })

        expect(result.confirmed).toBe(true)
        expect(result.timedOut).toBe(false)
        expect(result.nonInteractive).toBe(true)
      } finally {
        process.argv = originalArgv
      }
    })

    test('should auto-confirm when no TTY available', async () => {
      // Mock lack of TTY
      const originalStdin = process.stdin
      const originalStdout = process.stdout

      Object.defineProperty(process, 'stdin', {
        value: { isTTY: false },
        configurable: true
      })
      Object.defineProperty(process, 'stdout', {
        value: { isTTY: false },
        configurable: true
      })

      try {
        const result = await confirmation.confirm({
          taskId: 'TASK-005',
          title: 'Test task',
          riskLevel: RiskLevel.HIGH,
          reasons: ['Dangerous operation'],
        })

        expect(result.confirmed).toBe(true)
        expect(result.timedOut).toBe(false)
        expect(result.nonInteractive).toBe(true)
      } finally {
        Object.defineProperty(process, 'stdin', {
          value: originalStdin,
          configurable: true
        })
        Object.defineProperty(process, 'stdout', {
          value: originalStdout,
          configurable: true
        })
      }
    })

    test('should handle custom timeout in request', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const result = await confirmation.confirm({
        taskId: 'TASK-006',
        title: 'Test task',
        riskLevel: RiskLevel.HIGH,
        reasons: ['Dangerous operation'],
        timeout: 60000, // Custom timeout
      })

      expect(result.confirmed).toBe(true)
      expect(result.nonInteractive).toBe(true)
    })

    test('should use default timeout when not specified in request', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const conf = new InteractiveConfirmation(45000) // Custom default
      const result = await conf.confirm({
        taskId: 'TASK-007',
        title: 'Test task',
        riskLevel: RiskLevel.HIGH,
        reasons: ['Dangerous operation'],
        // No timeout specified
      })

      expect(result.confirmed).toBe(true)
      expect(result.nonInteractive).toBe(true)
    })
  })

  describe('isNonInteractiveMode', () => {
    test('should detect LOOPWORK_NON_INTERACTIVE env var', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const result = await confirmation.confirm({
        taskId: 'TASK-001',
        title: 'Test',
        riskLevel: RiskLevel.LOW,
        reasons: [],
      })

      expect(result.nonInteractive).toBe(true)
    })

    test('should detect CI env var', async () => {
      process.env.CI = 'true'

      const result = await confirmation.confirm({
        taskId: 'TASK-002',
        title: 'Test',
        riskLevel: RiskLevel.LOW,
        reasons: [],
      })

      expect(result.nonInteractive).toBe(true)
    })

    test('should detect -y flag', async () => {
      const originalArgv = process.argv
      process.argv = [...process.argv, '-y']

      try {
        const result = await confirmation.confirm({
          taskId: 'TASK-003',
          title: 'Test',
          riskLevel: RiskLevel.LOW,
          reasons: [],
        })

        expect(result.nonInteractive).toBe(true)
      } finally {
        process.argv = originalArgv
      }
    })

    test('should detect --yes flag', async () => {
      const originalArgv = process.argv
      process.argv = [...process.argv, '--yes']

      try {
        const result = await confirmation.confirm({
          taskId: 'TASK-004',
          title: 'Test',
          riskLevel: RiskLevel.LOW,
          reasons: [],
        })

        expect(result.nonInteractive).toBe(true)
      } finally {
        process.argv = originalArgv
      }
    })
  })

  describe('displayRiskInfo', () => {
    test('should display risk information for LOW risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-001',
          title: 'Simple task',
          riskLevel: RiskLevel.LOW,
          reasons: ['No significant risks'],
        })

        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should display risk information for MEDIUM risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-002',
          title: 'Database update',
          riskLevel: RiskLevel.MEDIUM,
          reasons: ['Database modification', 'Production environment'],
        })

        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should display risk information for HIGH risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-003',
          title: 'Delete files',
          riskLevel: RiskLevel.HIGH,
          reasons: ['Contains risky operations: delete, remove'],
        })

        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should display risk information for CRITICAL risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-004',
          title: 'Drop production table',
          riskLevel: RiskLevel.CRITICAL,
          reasons: ['Contains critical keywords: drop table', 'Production environment'],
        })

        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should display multiple risk reasons', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-005',
          title: 'Complex task',
          riskLevel: RiskLevel.HIGH,
          reasons: [
            'Database modification',
            'Production environment',
            'Contains risky operations: delete',
          ],
        })

        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })
  })

  describe('getRiskEmoji', () => {
    test('should return green emoji for LOW risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-001',
          title: 'Test',
          riskLevel: RiskLevel.LOW,
          reasons: [],
        })

        const calls = consoleSpy.mock.calls as any[][]
        const displayCall = calls.flat().find((call: string) => call.includes('Safety Confirmation Required'))
        expect(displayCall).toContain('🟢')
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should return yellow emoji for MEDIUM risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-002',
          title: 'Test',
          riskLevel: RiskLevel.MEDIUM,
          reasons: [],
        })

        const calls = consoleSpy.mock.calls as any[][]
        const displayCall = calls.flat().find((call: string) => call.includes('Safety Confirmation Required'))
        expect(displayCall).toContain('🟡')
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should return orange emoji for HIGH risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-003',
          title: 'Test',
          riskLevel: RiskLevel.HIGH,
          reasons: [],
        })

        const calls = consoleSpy.mock.calls as any[][]
        const displayCall = calls.flat().find((call: string) => call.includes('Safety Confirmation Required'))
        expect(displayCall).toContain('🟠')
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('should return red emoji for CRITICAL risk', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      try {
        await confirmation.confirm({
          taskId: 'TASK-004',
          title: 'Test',
          riskLevel: RiskLevel.CRITICAL,
          reasons: [],
        })

        const calls = consoleSpy.mock.calls as any[][]
        const displayCall = calls.flat().find((call: string) => call.includes('Safety Confirmation Required'))
        expect(displayCall).toContain('🔴')
      } finally {
        consoleSpy.mockRestore()
      }
    })
  })
})
