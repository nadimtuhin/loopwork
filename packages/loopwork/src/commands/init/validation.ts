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

export function validateProjectName(input: string): ValidationResult {
  const value = input.trim()

  if (value === '') {
    return { valid: false, error: 'Project name cannot be empty' }
  }

  // Allow alphanumeric, hyphens, underscores, and spaces (for multi-word names)
  const validPattern = new RegExp('^[a-zA-Z0-9][a-zA-Z0-9_\\s-]*[a-zA-Z0-9_]$')
  if (!validPattern.test(value)) {
    return {
      valid: false,
      error: 'Project name must start and end with alphanumeric characters (a-z, A-Z, 0-9, _, - allowed)'
    }
  }

  if (value.length > 100) {
    return { valid: false, error: 'Project name must be 100 characters or less' }
  }

  return { valid: true, value }
}

/**
 * Validate environment variable name
 */
export function validateEnvVarName(input: string): ValidationResult {
  const value = input.trim()
  
  if (value === '') {
    return { valid: false, error: 'Environment variable name cannot be empty' }
  }
  
  // ENV_VAR_NAME format
  const envPattern = /^[A-Z][A-Z0-9_]*$/
  if (!envPattern.test(value)) {
    return {
      valid: false,
      error: 'Environment variable name must be in UPPERCASE format (e.g., MY_VAR_NAME)'
    }
  }
  
  return { valid: true, value }
}

/**
 * Validate post-generation hook command
 */
export function validateHookCommand(input: string): ValidationResult {
  const value = input.trim()
  
  if (value === '') {
    return { valid: false, error: 'Hook command cannot be empty' }
  }
  
  // Basic safety check - prevent dangerous commands
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,           // rm -rf /
    /rm\s+-rf\s+~\//,           // rm -rf ~/
    />\s*\/dev\//,                 // > /dev/
    /:\s*cd\s+\.\./,              // : cd . (shell command injection)
    /&&\s*rm/,                    // && rm
    /\|\s*rm/,                     // | rm
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(value)) {
      return {
        valid: false,
        error: 'Hook command contains potentially dangerous operations. Please use a custom hooks file instead.'
      }
    }
  }
  
  return { valid: true, value }
}

/**
 * Validate hook configuration file path
 */
export function validateHookConfigPath(input: string): ValidationResult {
  const value = input.trim()
  
  if (value === '') {
    return { valid: true, value: '.loopwork/hooks.json' }
  }
  
  // Check for valid file extensions
  const validExtensions = ['.json', '.js', '.ts']
  const hasValidExtension = validExtensions.some(ext => value.endsWith(ext))
  
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Hook config file must have one of these extensions: ${validExtensions.join(', ')}`
    }
  }
  
  // Check for invalid characters in path
  const invalidChars = /[<>:"|?*]/
  if (invalidChars.test(value)) {
    return {
      valid: false,
      error: 'Hook config file path contains invalid characters: < > : " | ? *'
    }
  }
  
  return { valid: true, value }
}

/**
 * Validate namespace name (for daemon mode)
 */
export function validateNamespace(input: string): ValidationResult {
  const value = input.trim()
  
  if (value === '') {
    return { valid: true, value: 'default' }
  }
  
  // Allow alphanumeric, hyphens, underscores
  const validPattern = /^[a-z0-9][a-z0-9_-]*[a-z0-9_]$/
  if (!validPattern.test(value)) {
    return {
      valid: false,
      error: 'Namespace must be lowercase alphanumeric with hyphens and underscores only (a-z, 0-9, _, -)'
    }
  }
  
  if (value.length > 50) {
    return { valid: false, error: 'Namespace must be 50 characters or less' }
  }
  
  return { valid: true, value }
}

/**
 * Validate webhook URL
 */
export function validateWebhookUrl(input: string): ValidationResult {
  const value = input.trim()
  
  if (value === '') {
    return { valid: false, error: 'Webhook URL cannot be empty' }
  }
  
  try {
    const url = new URL(value)
    
    // Check for HTTPS (recommended for webhooks)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return {
        valid: false,
        error: 'Webhook URL must use http:// or https:// protocol'
      }
    }
    
    return { valid: true, value: url.toString() }
  } catch {
    return {
      valid: false,
      error: 'Invalid webhook URL format'
    }
  }
}

/**
 * Validate number input (general purpose)
 */
export function validateNumber(input: string, options: { min?: number; max?: number; defaultValue?: number } = {}): ValidationResult {
  const value = input.trim()
  
  if (value === '') {
    if (options.defaultValue !== undefined) {
      return { valid: true, value: options.defaultValue.toString() }
    }
    return { valid: false, error: 'Value cannot be empty' }
  }
  
  const number = parseFloat(value)
  
  if (isNaN(number)) {
    return { valid: false, error: 'Value must be a valid number' }
  }
  
  if (options.min !== undefined && number < options.min) {
    return { valid: false, error: `Value must be at least ${options.min}` }
  }
  
  if (options.max !== undefined && number > options.max) {
    return { valid: false, error: `Value must be at most ${options.max}` }
  }
  
  return { valid: true, value: number.toString() }
}
