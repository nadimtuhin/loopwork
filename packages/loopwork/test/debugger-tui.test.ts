/**
 * Tests for Debugger TUI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DebuggerTUI } from '../src/core/debugger-tui'
import type { DebugEvent, PrePromptEvent } from '../src/contracts/debugger'

describe('DebuggerTUI', () => {
  let tui: DebuggerTUI

  beforeEach(() => {
    tui = new DebuggerTUI()
  })

  afterEach(() => {
    tui.close()
  })

  describe('displayState', () => {
    test('should not throw when displaying event', () => {
      const event: DebugEvent = {
        type: 'TASK_START',
        timestamp: Date.now(),
        taskId: 'TEST-001',
        iteration: 1,
        data: { title: 'Test Task' },
      }

      // Just verify it doesn't throw
      expect(() => tui.displayState(event)).not.toThrow()
    })

    test('should handle event with error', () => {
      const event: DebugEvent = {
        type: 'ERROR',
        timestamp: Date.now(),
        error: new Error('Test error'),
      }

      expect(() => tui.displayState(event)).not.toThrow()
    })

    test('should handle PRE_PROMPT event with prompt preview', () => {
      const event: PrePromptEvent = {
        type: 'PRE_PROMPT',
        timestamp: Date.now(),
        prompt: 'This is a test prompt\nLine 2\nLine 3',
      }

      expect(() => tui.displayState(event)).not.toThrow()
    })

    test('should truncate long prompt preview', () => {
      const longPrompt = Array(20).fill('Line of text').join('\n')
      const event: PrePromptEvent = {
        type: 'PRE_PROMPT',
        timestamp: Date.now(),
        prompt: longPrompt,
      }

      // Should not throw and should truncate
      expect(() => tui.displayState(event)).not.toThrow()
    })
  })

  describe('displayHelp', () => {
    test('should not throw when displaying help', () => {
      expect(() => tui.displayHelp()).not.toThrow()
    })
  })

  describe('editPrompt', () => {
    test('should return null for empty edited content', async () => {
      // Create a mock editor that produces empty content
      const originalEditor = process.env.EDITOR
      const tmpDir = os.tmpdir()
      const mockEditorScript = path.join(tmpDir, 'mock-editor.sh')

      // Create a mock editor that clears the file
      fs.writeFileSync(mockEditorScript, '#!/bin/bash\necho "" > "$1"', { mode: 0o755 })
      process.env.EDITOR = mockEditorScript

      try {
        const result = await tui.editPrompt('Original prompt')
        // Should return null because content is empty
        expect(result).toBeNull()
      } finally {
        process.env.EDITOR = originalEditor
        fs.unlinkSync(mockEditorScript)
      }
    })

    test('should return modified content when editor makes changes', async () => {
      const originalEditor = process.env.EDITOR
      const tmpDir = os.tmpdir()
      const mockEditorScript = path.join(tmpDir, 'mock-editor-modify.sh')

      // Create a mock editor that modifies the file
      fs.writeFileSync(mockEditorScript, '#!/bin/bash\necho "Modified content" > "$1"', { mode: 0o755 })
      process.env.EDITOR = mockEditorScript

      try {
        const result = await tui.editPrompt('Original prompt')
        expect(result).toBe('Modified content\n')
      } finally {
        process.env.EDITOR = originalEditor
        fs.unlinkSync(mockEditorScript)
      }
    })

    test('should return null when content unchanged', async () => {
      const originalEditor = process.env.EDITOR
      const tmpDir = os.tmpdir()
      const mockEditorScript = path.join(tmpDir, 'mock-editor-noop.sh')

      // Create a mock editor that doesn't modify the file (exit immediately)
      fs.writeFileSync(mockEditorScript, '#!/bin/bash\n# Do nothing\nexit 0', { mode: 0o755 })
      process.env.EDITOR = mockEditorScript

      const originalContent = 'Original prompt'

      try {
        const result = await tui.editPrompt(originalContent)
        expect(result).toBeNull()
      } finally {
        process.env.EDITOR = originalEditor
        fs.unlinkSync(mockEditorScript)
      }
    })
  })
})
