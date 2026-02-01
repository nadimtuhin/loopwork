import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { ConsoleRenderer } from '../../src/output/console-renderer'

describe('ConsoleRenderer Worker Status', () => {
  let renderer: ConsoleRenderer
  let stdoutSpy: ReturnType<typeof spyOn>
  let stderrSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    renderer = new ConsoleRenderer({
      mode: 'human',
      logLevel: 'info',
    })
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    renderer.dispose()
  })

  test('renders worker status bar', () => {
    renderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 4,
      pendingTasks: 12,
      runningTasks: 4,
      completedTasks: 15,
      failedTasks: 2,
      timestamp: Date.now(),
    })

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    console.log('Console status output:', output)

    expect(output).toContain('Workers:')
    expect(output).toContain('4')
    expect(output).toContain('8')
    expect(output).toContain('Tasks:')
    expect(output).toContain('12')
    expect(output).toContain('pending')
    expect(output).toContain('4')
    expect(output).toContain('running')
    expect(output).toContain('15')
    expect(output).toContain('done')
    expect(output).toContain('2')
    expect(output).toContain('failed')
  })

  test('hides failed count when zero', () => {
    renderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 8,
      pendingTasks: 10,
      runningTasks: 8,
      completedTasks: 5,
      failedTasks: 0,
      timestamp: Date.now(),
    })

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    console.log('No failures output:', output)

    expect(output).toContain('Workers:')
    expect(output).toContain('Tasks:')
    // Should not show failed when count is 0
    expect(output).not.toContain('failed')
  })

  test('does not render in JSON mode', () => {
    const jsonRenderer = new ConsoleRenderer({
      mode: 'json',
      logLevel: 'info',
    })
    
    stdoutSpy.mockClear()

    jsonRenderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 4,
      pendingTasks: 12,
      runningTasks: 4,
      completedTasks: 15,
      failedTasks: 2,
      timestamp: Date.now(),
    })

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    
    // Should not render status bar in JSON mode
    expect(output).not.toContain('Workers:')
    expect(output).not.toContain('Tasks:')
    
    jsonRenderer.dispose()
  })

  test('does not render when totalWorkers is 0', () => {
    renderer.render({
      type: 'worker:status',
      totalWorkers: 0,
      activeWorkers: 0,
      pendingTasks: 0,
      runningTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      timestamp: Date.now(),
    })

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    
    // Should not render when no workers configured
    expect(output).not.toContain('Workers:')
  })

  test('updates status on multiple calls', () => {
    // First status - initial state
    renderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 8,
      pendingTasks: 20,
      runningTasks: 8,
      completedTasks: 0,
      failedTasks: 0,
      timestamp: Date.now(),
    })

    const firstOutput = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    expect(firstOutput).toContain('20')
    expect(firstOutput).toContain('pending')

    stdoutSpy.mockClear()

    // Second status - progress made
    renderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 8,
      pendingTasks: 12,
      runningTasks: 8,
      completedTasks: 8,
      failedTasks: 0,
      timestamp: Date.now(),
    })

    const secondOutput = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    expect(secondOutput).toContain('12')
    expect(secondOutput).toContain('8')
    expect(secondOutput).toContain('done')
  })
})
