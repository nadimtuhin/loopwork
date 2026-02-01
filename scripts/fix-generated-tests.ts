#!/usr/bin/env bun
/**
 * Fix generated tests to remove type imports
 */

import * as fs from 'fs'
import * as path from 'path'

function fixTestFile(filePath: string): void {
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // Remove type imports that don't exist at runtime
  // Pattern: import { Type1, Type2 } from './module'
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g
  
  content = content.replace(importRegex, (match, imports, modulePath) => {
    // Keep only the test imports
    const testImports = imports
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => 
        !s.includes('TaskResult') && 
        !s.includes('SwarmConfig') &&
        !s.includes('SwarmAgent') &&
        !s.includes('Task') ||
        s === 'Task' // Keep Task if it's a value
      )
      .join(', ')
    
    if (testImports.trim() === '') {
      // Check if we still have describe/expect/test
      if (match.includes('bun:test')) {
        return match
      }
      return `// Removed type-only import from '${modulePath}'`
    }
    
    return `import { ${testImports} } from '${modulePath}'`
  })
  
  // Remove describe blocks for types
  content = content.replace(
    /describe\(['"]\w+['"]\),\s*\{\s*test\(['"]should be defined['"],\s*\(\)\s*=>\s*\{\s*expect\(\w+\)\.toBeDefined\(\)\s*\}\s*\}\s*\}\)/g,
    ''
  )
  
  fs.writeFileSync(filePath, content, 'utf-8')
}

// Find and fix all generated tests
const packagesDir = path.join(process.cwd(), 'packages')

function scan(dir: string): void {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    
    if (stat.isDirectory()) {
      scan(fullPath)
    } else if (entry.endsWith('.test.ts')) {
      console.log(`Fixing: ${fullPath}`)
      fixTestFile(fullPath)
    }
  }
}

scan(packagesDir)
console.log('Done fixing tests')
