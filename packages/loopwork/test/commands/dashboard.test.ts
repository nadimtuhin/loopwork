import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { dashboard } from '../../src/commands/dashboard'

describe('dashboard command', () => {
  let mockDisplay: ReturnType<typeof mock>
  let mockInteractive: ReturnType<typeof mock>
  let MockDashboard: { new (): any; instances: any[] }

  beforeEach(() => {
    mockDisplay = mock(() => {})
    mockInteractive = mock(async () => {})
    class DashboardMock {
      static instances: any[] = []
      display = mockDisplay
      interactive = mockInteractive
      constructor() {
        DashboardMock.instances.push(this)
      }
    }
    MockDashboard = DashboardMock as any
  })

  afterEach(() => {
    mockDisplay.mockClear()
    mockInteractive.mockClear()
    MockDashboard.instances = []
  })

  test('displays dashboard in one-time mode', async () => {
    await dashboard({}, { DashboardClass: MockDashboard as any })

    expect(MockDashboard.instances.length).toBe(1)
    expect(mockDisplay).toHaveBeenCalled()
    expect(mockInteractive).not.toHaveBeenCalled()
  })

  test('displays dashboard in interactive mode with watch flag', async () => {
    await dashboard({ watch: true }, { DashboardClass: MockDashboard as any })

    expect(mockInteractive).toHaveBeenCalled()
    expect(mockDisplay).not.toHaveBeenCalled()
  })

  test('defaults to non-interactive mode', async () => {
    await dashboard(undefined, { DashboardClass: MockDashboard as any })

    expect(mockDisplay).toHaveBeenCalled()
    expect(mockInteractive).not.toHaveBeenCalled()
  })

  test('handles errors gracefully', async () => {
    // Override display to throw error
    mockDisplay.mockImplementation(() => {
      throw new Error('Terminal not supported')
    })

    const originalExit = process.exit
    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit')
    }) as any

    const originalError = console.error
    console.error = mock(() => {})

    try {
      await dashboard({}, { DashboardClass: MockDashboard as any })
    } catch (e: any) {
      if (e.message !== 'process.exit') throw e
    } finally {
      process.exit = originalExit
      console.error = originalError
    }

    expect(exitCode).toBe(1)
  })
})
