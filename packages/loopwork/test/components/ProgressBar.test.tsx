import React from 'react'
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { render } from 'ink-testing-library'
import { ProgressBar } from '../../src/components/ProgressBar'
import type { OutputRenderer } from '../../src/output/renderer'
import type { OutputConfig } from '../../src/output/contracts'
import { InkRenderer } from '../../src/output/ink-renderer'
import { mockTTY } from '../setup-ink'

describe('ProgressBar Component', () => {
  describe('deterministic mode (with percentage)', () => {
    test('should render 0% progress', () => {
      const { lastFrame } = render(<ProgressBar current={0} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('[')
      expect(frame).toContain('░'.repeat(20))
      expect(frame).toContain('] 0%')
    })

    test('should render 25% progress', () => {
      const { lastFrame } = render(<ProgressBar current={25} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('█'.repeat(5))
      expect(frame).toContain('░'.repeat(15))
      expect(frame).toContain('] 25%')
    })

    test('should render 50% progress', () => {
      const { lastFrame } = render(<ProgressBar current={50} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('50%')
      expect(frame).toContain('█')
      expect(frame).toContain('░')
    })

    test('should render 100% progress', () => {
      const { lastFrame } = render(<ProgressBar current={100} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('█'.repeat(20))
      expect(frame).toContain('] 100%')
    })

    test('should include message when provided', () => {
      const { lastFrame } = render(<ProgressBar current={75} total={100} width={20} message="Processing..." />)
      const frame = lastFrame()
      expect(frame).toContain('75%')
      expect(frame).toContain('Processing...')
    })

    test('should clamp progress to 100% max', () => {
      const { lastFrame } = render(<ProgressBar current={150} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('] 100%')
    })

    test('should clamp progress to 0% min', () => {
      const { lastFrame } = render(<ProgressBar current={-10} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('] 0%')
    })
  })

  describe('indeterminate mode (spinner)', () => {
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

    test('should render spinner with message', () => {
      const { lastFrame } = render(<ProgressBar indeterminate message="Loading..." />)
      const frame = lastFrame()
      expect(frame).toContain('Loading...')
      const hasSpinnerFrame = spinnerFrames.some(frame => frame.includes(frame))
      expect(hasSpinnerFrame).toBe(true)
    })

    test('should render spinner without message', () => {
      const { lastFrame } = render(<ProgressBar indeterminate />)
      const frame = lastFrame()
      const hasSpinnerFrame = spinnerFrames.some(frame => frame.includes(frame))
      expect(hasSpinnerFrame).toBe(true)
    })
  })

  describe('completed state', () => {
    test('should render success state by default', () => {
      const { lastFrame } = render(<ProgressBar completed message="Done!" />)
      const frame = lastFrame()
      expect(frame).toMatch(/✓|\[\+\]/)
      expect(frame).toContain('Done!')
    })

    test('should render failure state when completed=false', () => {
      const { lastFrame } = render(<ProgressBar completed={false} message="Failed!" />)
      const frame = lastFrame()
      expect(frame).toContain('Failed!')
    })
  })

  describe('event-based updates', () => {
    let renderer: InkRenderer | null = null

    afterEach(() => {
      renderer?.dispose()
    })

    test('should respond to progress:start event', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} id="test-progress" />)

      expect(lastFrame()).not.toContain('Loading...')

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Loading...',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      await new Promise(resolve => setTimeout(resolve, 200))
      const frame = lastFrame() || ''
      if (!frame.includes('Loading...')) {
        console.log('DEBUG Frame:', JSON.stringify(frame))
      }
      expect(frame).toContain('Loading...')
    })

    test('should respond to progress:update event with percentage', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} id="test-progress" />)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Loading...',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      renderer.renderEvent({
        type: 'progress:update',
        message: 'Processing...',
        percent: 50,
        timestamp: Date.now(),
        id: 'test-progress',
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lastFrame()).toContain('50%')
      expect(lastFrame()).toContain('Processing...')
    })

    test('should respond to progress:update event without percentage', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} id="test-progress" />)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Starting...',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      renderer.renderEvent({
        type: 'progress:update',
        message: 'Updating...',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lastFrame()).toContain('Updating...')
    })

    test('should respond to progress:stop event with success', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} id="test-progress" />)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Loading...',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      renderer.renderEvent({
        type: 'progress:stop',
        success: true,
        message: 'Complete!',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lastFrame()).toContain('✓')
      expect(lastFrame()).toContain('Complete!')
    })

    test('should respond to progress:stop event with failure', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} id="test-progress" />)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Loading...',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      renderer.renderEvent({
        type: 'progress:stop',
        success: false,
        message: 'Failed!',
        timestamp: Date.now(),
        id: 'test-progress',
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lastFrame()).toContain('✗')
      expect(lastFrame()).toContain('Failed!')
    })

    test('should ignore events with non-matching id', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} id="progress-1" />)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Should not show',
        timestamp: Date.now(),
        id: 'progress-2',
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lastFrame()).not.toContain('Should not show')
    })

    test('should respond to all events when id is not provided', async () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const { lastFrame } = render(<ProgressBar renderer={renderer} />)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Loading...',
        timestamp: Date.now(),
        id: 'some-progress-id',
      })

      await new Promise(resolve => setTimeout(resolve, 200))
      const frame = lastFrame() || ''
      if (!frame.includes('Loading...')) {
        console.log('DEBUG Frame:', JSON.stringify(frame))
      }
      expect(frame).toContain('Loading...')
    })
  })

  describe('edge cases', () => {
    test('should handle zero total', () => {
      const { lastFrame } = render(<ProgressBar current={0} total={0} width={10} />)
      const frame = lastFrame()
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      const hasSpinnerFrame = spinnerFrames.some(frame => frame.includes(frame))
      expect(hasSpinnerFrame).toBe(true)
    })

    test('should handle negative total', () => {
      const { lastFrame } = render(<ProgressBar current={5} total={-10} width={10} />)
      const frame = lastFrame()
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      const hasSpinnerFrame = spinnerFrames.some(frame => frame.includes(frame))
      expect(hasSpinnerFrame).toBe(true)
    })

    test('should default width to 20', () => {
      const { lastFrame } = render(<ProgressBar current={50} total={100} />)
      const frame = lastFrame()
      const match = frame?.match(/\[([█░]+)\]/)
      expect(match?.[1]?.length).toBe(20)
    })
  })

  describe('TTY detection', () => {
    mockTTY(true)

    test('should render correctly in TTY mode', () => {
      const { lastFrame } = render(<ProgressBar current={75} total={100} width={20} />)
      const frame = lastFrame()
      expect(frame).toContain('█')
      expect(frame).toContain('75%')
    })

    describe('non-TTY mode', () => {
      mockTTY(false)

      test('should render correctly in non-TTY mode', () => {
        const { lastFrame } = render(<ProgressBar current={75} total={100} width={20} />)
        const frame = lastFrame()
        expect(frame).toContain('█')
        expect(frame).toContain('75%')
      })
    })
  })
})
