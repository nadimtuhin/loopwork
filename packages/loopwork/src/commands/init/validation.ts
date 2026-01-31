export interface ValidationResult {
  valid: boolean
  error?: string
  value?: string
}

export function validateBackendType(input: string): ValidationResult {
  const value = input.trim().toLowerCase()
  const validBackends = ['json', 'github']

  if (validBackends.includes(value)) {
    return { valid: true, value }
  }

  return {
    valid: false,
    error: `Invalid backend. Must be one of: ${validBackends.join(', ')}`
  }
}

export function validateAiTool(input: string): ValidationResult {
  const value = input.trim().toLowerCase()
  const validTools = ['claude', 'opencode', 'gemini']

  if (validTools.includes(value)) {
    return { valid: true, value }
  }

  return {
    valid: false,
    error: `Invalid AI tool. Must be one of: ${validTools.join(', ')}`
  }
}

export function validateBudget(input: string): ValidationResult {
  const value = input.trim()

  if (value === '') {
    return { valid: true, value: '10.00' }
  }

  const number = parseFloat(value)

  if (isNaN(number)) {
    return { valid: false, error: 'Budget must be a valid number' }
  }

  if (number < 0) {
    return { valid: false, error: 'Budget cannot be negative' }
  }

  if (number > 10000) {
    return { valid: false, error: 'Budget seems too high. Are you sure? (max 10,000)' }
  }

  return { valid: true, value: number.toFixed(2) }
}

export function validateRepoName(input: string): ValidationResult {
  const value = input.trim()

  if (value === 'current repo') {
    return { valid: true, value: 'undefined' }
  }

  const repoPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

  if (repoPattern.test(value)) {
    return { valid: true, value: `'${value}'` }
  }

  return {
    valid: false,
    error: 'Invalid repository format. Use: owner/repo or "current repo"'
  }
}

export function validateDirectory(input: string): ValidationResult {
  let value = input.trim()

  if (value.endsWith('/')) {
    value = value.slice(0, -1)
  }

  if (value === '') {
    return { valid: false, error: 'Directory path cannot be empty' }
  }

  const invalidChars = /[<>:"|?*]/
  if (invalidChars.test(value)) {
    return {
      valid: false,
      error: 'Directory path contains invalid characters: < > : " | ? *'
    }
  }

  if (value.startsWith('/') && value !== '/') {
    return { valid: false, error: 'Use relative paths, not absolute paths starting with /' }
  }

  return { valid: true, value }
}

export function validateYesNo(input: string, defaultValue: 'y' | 'n' = 'y'): ValidationResult {
  const value = input.trim().toLowerCase()

  if (value === '') {
    return { valid: true, value: defaultValue }
  }

  if (value === 'y' || value === 'yes') {
    return { valid: true, value: 'y' }
  }

  if (value === 'n' || value === 'no') {
    return { valid: true, value: 'n' }
  }

  return {
    valid: false,
    error: 'Please enter "y", "yes", "n", or "no" (or press Enter for default)'
  }
}
