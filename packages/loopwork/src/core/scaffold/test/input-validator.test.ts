import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { InputValidator } from '../input-validator'

/**
 * input-validator Tests
 *
 * Auto-generated test suite for input validation
 */

describe('input-validator', () => {
  describe('InputValidator', () => {
    test('should instantiate without errors', () => {
      const instance = new InputValidator()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(InputValidator)
    })

    test('should return built-in validators', () => {
      const validator = new InputValidator()
      const builtIns = validator.getValidators()
      expect(builtIns).toBeDefined()
      expect(typeof builtIns.required).toBe('function')
      expect(typeof builtIns.pattern).toBe('function')
      expect(typeof builtIns.minLength).toBe('function')
      expect(typeof builtIns.maxLength).toBe('function')
      expect(typeof builtIns.enum).toBe('function')
      expect(typeof builtIns.custom).toBe('function')
    })
  })

  describe('required validator', () => {
    test('should pass for non-empty string', () => {
      const validator = new InputValidator()
      const result = validator.required()('test')
      expect(result.valid).toBe(true)
    })

    test('should fail for empty string', () => {
      const validator = new InputValidator()
      const result = validator.required()('')
      expect(result.valid).toBe(false)
    })

    test('should fail for undefined', () => {
      const validator = new InputValidator()
      const result = validator.required()(undefined)
      expect(result.valid).toBe(false)
    })

    test('should fail for null', () => {
      const validator = new InputValidator()
      const result = validator.required()(null)
      expect(result.valid).toBe(false)
    })

    test('should use custom message', () => {
      const validator = new InputValidator()
      const result = validator.required('Custom required message')(undefined)
      expect(result.valid).toBe(false)
      expect(result.message).toBe('Custom required message')
    })
  })

  describe('pattern validator', () => {
    test('should pass for matching pattern', () => {
      const validator = new InputValidator()
      const result = validator.pattern(/^[a-z]+$/)('test')
      expect(result.valid).toBe(true)
    })

    test('should fail for non-matching pattern', () => {
      const validator = new InputValidator()
      const result = validator.pattern(/^[a-z]+$/)('TEST')
      expect(result.valid).toBe(false)
    })

    test('should skip validation for null', () => {
      const validator = new InputValidator()
      const result = validator.pattern(/^[a-z]+$/)(null)
      expect(result.valid).toBe(true)
    })
  })

  describe('minLength validator', () => {
    test('should pass for string of exact length', () => {
      const validator = new InputValidator()
      const result = validator.minLength(5)('hello')
      expect(result.valid).toBe(true)
    })

    test('should pass for string longer than min', () => {
      const validator = new InputValidator()
      const result = validator.minLength(5)('helloworld')
      expect(result.valid).toBe(true)
    })

    test('should fail for string shorter than min', () => {
      const validator = new InputValidator()
      const result = validator.minLength(5)('hi')
      expect(result.valid).toBe(false)
    })
  })

  describe('maxLength validator', () => {
    test('should pass for string of exact length', () => {
      const validator = new InputValidator()
      const result = validator.maxLength(5)('hello')
      expect(result.valid).toBe(true)
    })

    test('should pass for string shorter than max', () => {
      const validator = new InputValidator()
      const result = validator.maxLength(5)('hi')
      expect(result.valid).toBe(true)
    })

    test('should fail for string longer than max', () => {
      const validator = new InputValidator()
      const result = validator.maxLength(5)('helloworld')
      expect(result.valid).toBe(false)
    })
  })

  describe('enum validator', () => {
    test('should pass for value in allowed list', () => {
      const validator = new InputValidator()
      const result = validator.enum(['a', 'b', 'c'])('a')
      expect(result.valid).toBe(true)
    })

    test('should fail for value not in allowed list', () => {
      const validator = new InputValidator()
      const result = validator.enum(['a', 'b', 'c'])('d')
      expect(result.valid).toBe(false)
    })
  })

  describe('custom validator', () => {
    test('should pass result through when valid', () => {
      const validator = new InputValidator()
      const customValidator: any = () => ({ valid: true, message: 'Custom message' })
      const result = validator.custom(customValidator)('test')
      expect(result.valid).toBe(true)
    })

    test('should use custom message when provided', () => {
      const validator = new InputValidator()
      const customValidator: any = () => ({ valid: false, message: 'Original' })
      const result = validator.custom(customValidator, 'Overridden')('test')
      expect(result.valid).toBe(false)
      expect(result.message).toBe('Overridden')
    })
  })

  describe('createRule', () => {
    test('should create validation rule with validators', () => {
      const validator = new InputValidator()
      const rule = validator.createRule('testField', validator.required())
      expect(rule.field).toBe('testField')
      expect(rule.validators).toHaveLength(1)
    })
  })

  describe('createConfig', () => {
    test('should create validation config', () => {
      const validator = new InputValidator()
      const rule = validator.createRule('testField', validator.required())
      const config = validator.createConfig([rule], true)
      expect(config.rules).toHaveLength(1)
      expect(config.failFast).toBe(true)
    })
  })

  describe('validate', () => {
    test('should pass validation when all rules pass', () => {
      const validator = new InputValidator()
      const config = validator.createConfig([
        validator.createRule('name', validator.required()),
        validator.createRule('age', validator.pattern(/^\d+$/))
      ])
      const result = validator.validate({ name: 'test', age: '25' }, config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('should fail validation when rules fail', () => {
      const validator = new InputValidator()
      const config = validator.createConfig([
        validator.createRule('name', validator.required()),
        validator.createRule('age', validator.pattern(/^\d+$/))
      ])
      const result = validator.validate({ name: '', age: 'abc' }, config)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
    })

    test('should collect all errors when failFast is false', () => {
      const validator = new InputValidator()
      const config = validator.createConfig([
        validator.createRule('name', validator.required()),
        validator.createRule('email', validator.required())
      ], false)
      const result = validator.validate({ name: '', email: '' }, config)
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
    })

    test('should stop at first error when failFast is true', () => {
      const validator = new InputValidator()
      const config = validator.createConfig([
        validator.createRule('name', validator.required()),
        validator.createRule('email', validator.required())
      ], true)
      const result = validator.validate({ name: '', email: '' }, config)
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
    })
  })

  describe('defaultTemplateNameValidator', () => {
    test('should pass for valid template name', () => {
      const validator = new InputValidator()
      const config = InputValidator.defaultTemplateNameValidator()
      const result = validator.validate({ templateName: 'my-template' }, config)
      expect(result.valid).toBe(true)
    })

    test('should fail for template name with spaces', () => {
      const validator = new InputValidator()
      const config = InputValidator.defaultTemplateNameValidator()
      const result = validator.validate({ templateName: 'my template' }, config)
      expect(result.valid).toBe(false)
    })
  })

  describe('defaultNameValidator', () => {
    test('should pass for valid name', () => {
      const validator = new InputValidator()
      const config = InputValidator.defaultNameValidator()
      const result = validator.validate({ name: 'myFeature' }, config)
      expect(result.valid).toBe(true)
    })

    test('should fail for name starting with number', () => {
      const validator = new InputValidator()
      const config = InputValidator.defaultNameValidator()
      const result = validator.validate({ name: '123abc' }, config)
      expect(result.valid).toBe(false)
    })

    test('should fail for name exceeding max length', () => {
      const validator = new InputValidator()
      const config = InputValidator.defaultNameValidator()
      const result = validator.validate({ name: 'a'.repeat(101) }, config)
      expect(result.valid).toBe(false)
    })
  })
})
