import {
  InputValidationResult,
  InputValidationError,
  InputValidationWarning,
  ValidationConfig,
  ValidationRule,
  Validator,
  ValidatorResult,
  BuiltInValidators
} from './types'

export class InputValidator {
  private builtInValidators: BuiltInValidators

  constructor() {
    this.builtInValidators = {
      required: this.required.bind(this),
      pattern: this.pattern.bind(this),
      minLength: this.minLength.bind(this),
      maxLength: this.maxLength.bind(this),
      enum: this.enum.bind(this),
      custom: this.custom.bind(this)
    }
  }

  getValidators(): BuiltInValidators {
    return this.builtInValidators
  }

  validate(data: Record<string, unknown>, config: ValidationConfig): InputValidationResult {
    const errors: InputValidationError[] = []
    const warnings: InputValidationWarning[] = []
    const failFast = config.failFast ?? false

    for (const rule of config.rules) {
      const value = data[rule.field]

      for (const validator of rule.validators) {
        const result = validator(value)

        if (!result.valid) {
          const error: InputValidationError = {
            field: rule.field,
            message: result.message || 'Validation failed',
            value
          }
          errors.push(error)

          if (failFast) {
            return { valid: false, errors, warnings }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  required(message?: string): Validator {
    return (value: unknown): ValidatorResult => {
      const isValid = value !== undefined && value !== null && value !== ''
      return {
        valid: isValid,
        message: message || `Field is required`
      }
    }
  }

  pattern(regex: RegExp, message?: string): Validator {
    return (value: unknown): ValidatorResult => {
      if (value === undefined || value === null || typeof value !== 'string') {
        return { valid: true }
      }
      const isValid = regex.test(value)
      return {
        valid: isValid,
        message: message || `Value must match pattern ${regex}`
      }
    }
  }

  minLength(min: number, message?: string): Validator {
    return (value: unknown): ValidatorResult => {
      if (value === undefined || value === null || typeof value !== 'string') {
        return { valid: true }
      }
      const isValid = value.length >= min
      return {
        valid: isValid,
        message: message || `Value must be at least ${min} characters`
      }
    }
  }

  maxLength(max: number, message?: string): Validator {
    return (value: unknown): ValidatorResult => {
      if (value === undefined || value === null || typeof value !== 'string') {
        return { valid: true }
      }
      const isValid = value.length <= max
      return {
        valid: isValid,
        message: message || `Value must be at most ${max} characters`
      }
    }
  }

  enum<T extends string>(allowedValues: T[], message?: string): Validator {
    return (value: unknown): ValidatorResult => {
      if (value === undefined || value === null) {
        return { valid: true }
      }
      const isValid = allowedValues.includes(value as T)
      return {
        valid: isValid,
        message: message || `Value must be one of: ${allowedValues.join(', ')}`
      }
    }
  }

  custom(fn: Validator, message?: string): Validator {
    return (value: unknown): ValidatorResult => {
      const result = fn(value)
      if (result.message && !message) {
        return result
      }
      return {
        valid: result.valid,
        message: message || result.message
      }
    }
  }

  createRule(field: string, ...validators: Validator[]): ValidationRule {
    return {
      field,
      validators
    }
  }

  createConfig(rules: ValidationRule[], failFast = false): ValidationConfig {
    return {
      rules,
      failFast
    }
  }

  static defaultTemplateNameValidator(): ValidationConfig {
    const validator = new InputValidator()
    return validator.createConfig([
      validator.createRule('templateName', validator.required('Template name is required')),
      validator.createRule('templateName', validator.pattern(/^[a-zA-Z0-9_-]+$/, 'Template name must contain only letters, numbers, hyphens, and underscores'))
    ])
  }

  static defaultNameValidator(): ValidationConfig {
    const validator = new InputValidator()
    return validator.createConfig([
      validator.createRule('name', validator.required('Name is required')),
      validator.createRule('name', validator.pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Name must start with a letter or underscore and contain only alphanumeric characters and underscores')),
      validator.createRule('name', validator.maxLength(100, 'Name must be at most 100 characters'))
    ])
  }
}
