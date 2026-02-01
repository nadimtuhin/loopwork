/**
 * OpenCode Self-Healing Module
 *
 * Automatically detects and fixes common OpenCode CLI issues:
 * - Missing dependencies (zod, etc.)
 * - Corrupted cache
 * - Installation issues
 *
 * This integrates with the existing self-healing system in parallel-runner.
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { logger } from './utils'

const execAsync = promisify(spawn)

/**
 * Types of OpenCode issues that can be detected
 */
export type OpencodeIssueType = 
  | 'missing_dependency'
  | 'corrupted_cache'
  | 'installation_error'
  | 'permission_error'
  | 'unknown'

/**
 * Detected issue with metadata
 */
export interface OpencodeIssue {
  type: OpencodeIssueType
  message: string
  package?: string
  location?: string
  autoFixable: boolean
}

/**
 * Result of healing attempt
 */
export interface HealingResult {
  success: boolean
  issue: OpencodeIssue
  actionTaken: string
  error?: string
}

/**
 * Common dependency issues and their solutions
 */
const DEPENDENCY_PATTERNS: Array<{
  pattern: RegExp
  package: string
  location: 'cache' | 'main' | 'both'
}> = [
  {
    pattern: /Cannot find package ['"]zod['"]/i,
    package: 'zod',
    location: 'cache',
  },
  {
    pattern: /Cannot find module ['"]zod['"]/i,
    package: 'zod',
    location: 'cache',
  },
  {
    pattern: /Cannot find package ['"]@opencode-ai\/plugin['"]/i,
    package: '@opencode-ai/plugin',
    location: 'main',
  },
  {
    pattern: /Cannot resolve ['"]zod['"]/i,
    package: 'zod',
    location: 'cache',
  },
  {
    pattern: /Module not found.*zod/i,
    package: 'zod',
    location: 'cache',
  },
]

/**
 * Cache corruption patterns
 */
const CACHE_CORRUPTION_PATTERNS = [
  /cache corruption/i,
  /invalid cache/i,
  /corrupted.*cache/i,
  /ENOENT.*cache/i,
  /bad json/i,
]

/**
 * Installation path patterns
 */
const OPENCODE_PATHS = {
  main: '~/.opencode',
  cache: '~/.cache/opencode',
  bin: '~/.opencode/bin/opencode',
}

/**
 * Resolve tilde to home directory
 */
function resolvePath(inputPath: string): string {
  if (inputPath.startsWith('~/')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || '', inputPath.slice(2))
  }
  return inputPath
}

/**
 * Detect OpenCode issues from error output
 */
export function detectOpencodeIssues(errorOutput: string): OpencodeIssue[] {
  const issues: OpencodeIssue[] = []
  const lines = errorOutput.split('\n')
  
  for (const line of lines) {
    // Check for missing dependencies
    for (const { pattern, package: pkg, location } of DEPENDENCY_PATTERNS) {
      if (pattern.test(line)) {
        const existing = issues.find(i => i.package === pkg && i.type === 'missing_dependency')
        if (!existing) {
          issues.push({
            type: 'missing_dependency',
            message: `Missing dependency: ${pkg}`,
            package: pkg,
            location: location === 'both' ? 'cache' : location,
            autoFixable: true,
          })
        }
      }
    }
    
    // Check for cache corruption
    for (const pattern of CACHE_CORRUPTION_PATTERNS) {
      if (pattern.test(line)) {
        const existing = issues.find(i => i.type === 'corrupted_cache')
        if (!existing) {
          issues.push({
            type: 'corrupted_cache',
            message: 'Cache corruption detected',
            autoFixable: true,
          })
        }
      }
    }
  }
  
  return issues
}

/**
 * Check if opencode installation exists and is valid
 */
export async function validateOpencodeInstallation(): Promise<{
  valid: boolean
  issues: string[]
}> {
  const issues: string[] = []
  
  const mainPath = resolvePath(OPENCODE_PATHS.main)
  const cachePath = resolvePath(OPENCODE_PATHS.cache)
  const binPath = resolvePath(OPENCODE_PATHS.bin)
  
  // Check main installation
  if (!fs.existsSync(mainPath)) {
    issues.push(`OpenCode main directory not found: ${mainPath}`)
  } else {
    // Check for package.json in main
    const mainPackageJson = path.join(mainPath, 'package.json')
    if (!fs.existsSync(mainPackageJson)) {
      issues.push(`OpenCode main package.json missing`)
    }
    
    // Check for node_modules in main
    const mainNodeModules = path.join(mainPath, 'node_modules')
    if (!fs.existsSync(mainNodeModules)) {
      issues.push(`OpenCode main node_modules missing`)
    }
  }
  
  // Check cache
  if (!fs.existsSync(cachePath)) {
    issues.push(`OpenCode cache directory not found: ${cachePath}`)
  } else {
    // Check for package.json in cache
    const cachePackageJson = path.join(cachePath, 'package.json')
    if (!fs.existsSync(cachePackageJson)) {
      issues.push(`OpenCode cache package.json missing`)
    }
    
    // Check for node_modules in cache
    const cacheNodeModules = path.join(cachePath, 'node_modules')
    if (!fs.existsSync(cacheNodeModules)) {
      issues.push(`OpenCode cache node_modules missing`)
    }
  }
  
  // Check binary
  if (!fs.existsSync(binPath)) {
    issues.push(`OpenCode binary not found: ${binPath}`)
  }
  
  return {
    valid: issues.length === 0,
    issues,
  }
}

/**
 * Fix missing dependency in cache
 */
async function fixCacheDependency(packageName: string): Promise<boolean> {
  const cachePath = resolvePath(OPENCODE_PATHS.cache)
  const packageJsonPath = path.join(cachePath, 'package.json')
  
  try {
    logger.info(`[OpencodeHealer] Installing missing dependency in cache: ${packageName}`)
    
    // Read current package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    
    // Add dependency if not present
    if (!packageJson.dependencies) {
      packageJson.dependencies = {}
    }
    
    if (!packageJson.dependencies[packageName]) {
      // Use latest version
      packageJson.dependencies[packageName] = '^3.0.0'
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
      logger.info(`[OpencodeHealer] Added ${packageName} to cache package.json`)
    }
    
    // Run bun install
    return new Promise((resolve) => {
      const child = spawn('bun', ['install'], {
        cwd: cachePath,
        stdio: 'pipe',
      })
      
      let stdout = ''
      let stderr = ''
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })
      
      child.on('close', (code) => {
        if (code === 0) {
          logger.success(`[OpencodeHealer] Successfully installed ${packageName} in cache`)
          resolve(true)
        } else {
          logger.error(`[OpencodeHealer] Failed to install ${packageName}: ${stderr}`)
          resolve(false)
        }
      })
      
      child.on('error', (error) => {
        logger.error(`[OpencodeHealer] Error installing ${packageName}: ${error.message}`)
        resolve(false)
      })
    })
  } catch (error) {
    logger.error(`[OpencodeHealer] Error fixing cache dependency: ${error}`)
    return false
  }
}

/**
 * Fix missing dependency in main installation
 */
async function fixMainDependency(packageName: string): Promise<boolean> {
  const mainPath = resolvePath(OPENCODE_PATHS.main)
  
  try {
    logger.info(`[OpencodeHealer] Installing missing dependency in main: ${packageName}`)
    
    // Run bun add
    return new Promise((resolve) => {
      const child = spawn('bun', ['add', packageName], {
        cwd: mainPath,
        stdio: 'pipe',
      })
      
      let stderr = ''
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })
      
      child.on('close', (code) => {
        if (code === 0) {
          logger.success(`[OpencodeHealer] Successfully installed ${packageName} in main`)
          resolve(true)
        } else {
          logger.error(`[OpencodeHealer] Failed to install ${packageName}: ${stderr}`)
          resolve(false)
        }
      })
      
      child.on('error', (error) => {
        logger.error(`[OpencodeHealer] Error installing ${packageName}: ${error.message}`)
        resolve(false)
      })
    })
  } catch (error) {
    logger.error(`[OpencodeHealer] Error fixing main dependency: ${error}`)
    return false
  }
}

/**
 * Clear and rebuild opencode cache
 */
async function rebuildCache(): Promise<boolean> {
  const cachePath = resolvePath(OPENCODE_PATHS.cache)
  
  try {
    logger.warn('[OpencodeHealer] Rebuilding OpenCode cache...')
    
    // Backup existing cache
    const backupPath = `${cachePath}.backup.${Date.now()}`
    if (fs.existsSync(cachePath)) {
      fs.renameSync(cachePath, backupPath)
      logger.info(`[OpencodeHealer] Backed up cache to ${backupPath}`)
    }
    
    // Create new cache directory
    fs.mkdirSync(cachePath, { recursive: true })
    
    // Create basic package.json
    const packageJson = {
      dependencies: {
        '@gitlab/opencode-gitlab-auth': '1.3.2',
        'oh-my-opencode': '3.2.1',
        'opencode-anthropic-auth': '0.0.13',
        'opencode-antigravity-auth': '1.4.3',
        'zod': '^3.22.0',
      },
    }
    
    fs.writeFileSync(
      path.join(cachePath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )
    
    // Install dependencies
    return new Promise((resolve) => {
      const child = spawn('bun', ['install'], {
        cwd: cachePath,
        stdio: 'pipe',
      })
      
      let stderr = ''
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })
      
      child.on('close', (code) => {
        if (code === 0) {
          logger.success('[OpencodeHealer] Successfully rebuilt cache')
          // Remove backup on success
          if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true })
          }
          resolve(true)
        } else {
          logger.error(`[OpencodeHealer] Failed to rebuild cache: ${stderr}`)
          // Restore backup on failure
          if (fs.existsSync(backupPath)) {
            fs.rmSync(cachePath, { recursive: true, force: true })
            fs.renameSync(backupPath, cachePath)
            logger.info('[OpencodeHealer] Restored cache from backup')
          }
          resolve(false)
        }
      })
      
      child.on('error', (error) => {
        logger.error(`[OpencodeHealer] Error rebuilding cache: ${error.message}`)
        // Restore backup
        if (fs.existsSync(backupPath)) {
          fs.rmSync(cachePath, { recursive: true, force: true })
          fs.renameSync(backupPath, cachePath)
        }
        resolve(false)
      })
    })
  } catch (error) {
    logger.error(`[OpencodeHealer] Error rebuilding cache: ${error}`)
    return false
  }
}

/**
 * Attempt to heal a detected OpenCode issue
 */
export async function healOpencodeIssue(issue: OpencodeIssue): Promise<HealingResult> {
  if (!issue.autoFixable) {
    return {
      success: false,
      issue,
      actionTaken: 'none',
      error: 'Issue is not auto-fixable',
    }
  }
  
  switch (issue.type) {
    case 'missing_dependency': {
      if (!issue.package) {
        return {
          success: false,
          issue,
          actionTaken: 'none',
          error: 'Package name not specified',
        }
      }
      
      let success = false
      
      if (issue.location === 'cache' || issue.location === 'both') {
        success = await fixCacheDependency(issue.package)
      }
      
      if (!success && (issue.location === 'main' || issue.location === 'both')) {
        success = await fixMainDependency(issue.package)
      }
      
      return {
        success,
        issue,
        actionTaken: `installed ${issue.package} in ${issue.location}`,
      }
    }
    
    case 'corrupted_cache': {
      const success = await rebuildCache()
      return {
        success,
        issue,
        actionTaken: 'rebuilt cache',
      }
    }
    
    default:
      return {
        success: false,
        issue,
        actionTaken: 'none',
        error: `Unknown issue type: ${issue.type}`,
      }
  }
}

/**
 * Main entry point: Analyze error and attempt healing
 * Returns true if healing was successful, false otherwise
 */
export async function attemptOpencodeSelfHealing(errorOutput: string): Promise<boolean> {
  const issues = detectOpencodeIssues(errorOutput)
  
  if (issues.length === 0) {
    return false // No OpenCode issues detected
  }
  
  logger.warn('[OpencodeHealer] Detected OpenCode issues:')
  for (const issue of issues) {
    logger.warn(`  - ${issue.message} (${issue.autoFixable ? 'auto-fixable' : 'manual fix required'})`)
  }
  
  // Try to heal each issue
  let anySuccess = false
  for (const issue of issues) {
    if (issue.autoFixable) {
      logger.info(`[OpencodeHealer] Attempting to heal: ${issue.message}`)
      const result = await healOpencodeIssue(issue)
      
      if (result.success) {
        logger.success(`[OpencodeHealer] Healed: ${result.actionTaken}`)
        anySuccess = true
      } else {
        logger.error(`[OpencodeHealer] Failed to heal: ${result.error || 'unknown error'}`)
      }
    }
  }
  
  return anySuccess
}

/**
 * Check if error is OpenCode-related
 */
export function isOpencodeError(error: string): boolean {
  const issues = detectOpencodeIssues(error)
  return issues.length > 0
}

/**
 * Integrate with parallel-runner's self-healing system
 * This should be called from categorizeFailure() in parallel-runner.ts
 */
export function categorizeOpencodeFailure(error: string): 'opencode_dependency' | 'opencode_cache' | null {
  const issues = detectOpencodeIssues(error)
  
  for (const issue of issues) {
    if (issue.type === 'missing_dependency') {
      return 'opencode_dependency'
    }
    if (issue.type === 'corrupted_cache') {
      return 'opencode_cache'
    }
  }
  
  return null
}
