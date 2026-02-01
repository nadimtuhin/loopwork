import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { MonitorAction, AutoFixAction, PauseAction, SkipAction, NotifyAction, AnalyzeAction, EnhanceTaskAction, ActionResult, ActionStats, ThrottleState } from '../actions/types'

describe('types', () => {

  describe('MonitorAction', () => {
    test('should be defined', () => {
      expect(MonitorAction).toBeDefined()
    })
  })

  describe('AutoFixAction', () => {
    test('should be defined', () => {
      expect(AutoFixAction).toBeDefined()
    })
  })

  describe('PauseAction', () => {
    test('should be defined', () => {
      expect(PauseAction).toBeDefined()
    })
  })

  describe('SkipAction', () => {
    test('should be defined', () => {
      expect(SkipAction).toBeDefined()
    })
  })

  describe('NotifyAction', () => {
    test('should be defined', () => {
      expect(NotifyAction).toBeDefined()
    })
  })

  describe('AnalyzeAction', () => {
    test('should be defined', () => {
      expect(AnalyzeAction).toBeDefined()
    })
  })

  describe('EnhanceTaskAction', () => {
    test('should be defined', () => {
      expect(EnhanceTaskAction).toBeDefined()
    })
  })

  describe('ActionResult', () => {
    test('should be defined', () => {
      expect(ActionResult).toBeDefined()
    })
  })

  describe('ActionStats', () => {
    test('should be defined', () => {
      expect(ActionStats).toBeDefined()
    })
  })

  describe('ThrottleState', () => {
    test('should be defined', () => {
      expect(ThrottleState).toBeDefined()
    })
  })
})
