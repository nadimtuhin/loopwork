import { describe, expect, test } from 'bun:test'
import { DEFAULT_CLI_PATH_CONFIG, type IBinaryInfo, type IDetectionOptions, type IDetectionResult, type ICliDetector, type ICliPathConfig } from '../cli'

/**
 * cli Tests
 *
 * Auto-generated test suite for cli
 */

describe('cli', () => {
  describe('DEFAULT_CLI_PATH_CONFIG', () => {
    test('should be defined', () => {
      expect(DEFAULT_CLI_PATH_CONFIG).toBeDefined()
      expect(typeof DEFAULT_CLI_PATH_CONFIG).toBe('object')
    })
  })
})
