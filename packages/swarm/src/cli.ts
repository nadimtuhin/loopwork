#!/usr/bin/env bun
/**
 * Swarm Test Generator CLI
 * 
 * Usage: bun run packages/swarm/src/cli.ts [options]
 */

import { SwarmCoordinator } from './coordinator'
import { createTestGeneratorAgent } from './agents/test-generator'
import * as fs from 'fs'
import * as path from 'path'

interface CLIOptions {
  packages: string[]
  concurrency: number
  dryRun: boolean
  verbose: boolean
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const options: CLIOptions = {
    packages: [],
    concurrency: 5,
    dryRun: false,
    verbose: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-p':
      case '--package':
        options.packages.push(args[++i])
        break
      case '-c':
      case '--concurrency':
        options.concurrency = parseInt(args[++i], 10)
        break
      case '-d':
      case '--dry-run':
        options.dryRun = true
        break
      case '-v':
      case '--verbose':
        options.verbose = true
        break
      case '-h':
      case '--help':
        showHelp()
        process.exit(0)
        break
    }
  }

  return options
}

function showHelp(): void {
  console.log(`
Swarm Test Generator

Usage: bun run packages/swarm/src/cli.ts [options]

Options:
  -p, --package <name>     Target package (can specify multiple)
  -c, --concurrency <n>    Max concurrent agents (default: 5)
  -d, --dry-run            Show what would be generated without writing
  -v, --verbose            Verbose output
  -h, --help               Show this help

Examples:
  bun run packages/swarm/src/cli.ts -p contracts -p executor
  bun run packages/swarm/src/cli.ts --package common --concurrency 3
`)
}

function discoverPackages(): string[] {
  const packagesDir = path.join(process.cwd(), 'packages')
  return fs.readdirSync(packagesDir)
    .filter(name => fs.statSync(path.join(packagesDir, name)).isDirectory())
    .filter(name => {
      // Only include packages with source files
      const srcDir = path.join(packagesDir, name, 'src')
      return fs.existsSync(srcDir) && 
             fs.readdirSync(srcDir).some(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    })
}

function getSourceFiles(packageName: string): string[] {
  const srcDir = path.join(process.cwd(), 'packages', packageName, 'src')
  if (!fs.existsSync(srcDir)) return []

  const files: string[] = []
  
  function walk(dir: string): void {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath)
      }
    }
  }

  walk(srcDir)
  return files
}

function getUntestedFiles(packageName: string): string[] {
  const allFiles = getSourceFiles(packageName)
  const untested: string[] = []

  for (const file of allFiles) {
    const dirName = path.dirname(file)
    const baseName = path.basename(file, '.ts')
    const testFile = path.join(dirName, 'test', `${baseName}.test.ts`)
    
    if (!fs.existsSync(testFile)) {
      untested.push(file)
    }
  }

  return untested
}

async function main(): Promise<void> {
  const options = parseArgs()

  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║           SWARM TEST GENERATOR                           ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  // Determine target packages
  const targetPackages = options.packages.length > 0 
    ? options.packages 
    : discoverPackages()

  console.log(`Target packages: ${targetPackages.join(', ')}`)
  console.log(`Concurrency: ${options.concurrency}`)
  console.log(`Dry run: ${options.dryRun}`)
  console.log('')

  // Find untested files
  const packageUntestedFiles = new Map<string, string[]>()
  let totalUntested = 0

  for (const pkg of targetPackages) {
    const untested = getUntestedFiles(pkg)
    packageUntestedFiles.set(pkg, untested)
    totalUntested += untested.length
  }

  console.log(`Found ${totalUntested} untested files\n`)

  if (totalUntested === 0) {
    console.log('✅ All files already have tests!')
    return
  }

  // Show breakdown
  for (const [pkg, files] of packageUntestedFiles) {
    if (files.length > 0) {
      console.log(`${pkg}: ${files.length} untested files`)
      if (options.verbose) {
        for (const file of files) {
          console.log(`  - ${path.relative(process.cwd(), file)}`)
        }
      }
    }
  }
  console.log('')

  if (options.dryRun) {
    console.log('(Dry run - no files will be written)')
    return
  }

  // Create coordinator
  const coordinator = new SwarmCoordinator({
    maxConcurrency: options.concurrency,
    timeoutMs: 120000,
    retryFailed: false,
  })

  // Create agents for each package
  const tasks: Array<{ id: string; pkg: string; files: string[] }> = []
  
  for (const [pkg, files] of packageUntestedFiles) {
    if (files.length === 0) continue

    const agent = createTestGeneratorAgent({
      targetPackage: pkg,
      sourceFiles: files,
      testFramework: 'bun:test',
      coverageThreshold: 80,
    })

    coordinator.registerAgent(agent)

    // Create tasks for each file
    for (const file of files) {
      tasks.push({
        id: `${pkg}-${path.basename(file, '.ts')}`,
        pkg,
        files: [file],
      })
    }
  }

  // Add tasks
  for (const task of tasks) {
    coordinator.addTask({
      id: task.id,
      type: 'generate-tests',
      target: task.pkg,
      priority: 100,
      context: { files: task.files },
    })
  }

  // Run swarm
  console.log(`Running swarm with ${tasks.length} tasks...\n`)
  const startTime = Date.now()
  
  const results = await coordinator.run()
  
  const duration = Date.now() - startTime

  // Display results
  console.log(coordinator.generateReport())
  console.log(`Duration: ${duration}ms`)

  // Exit with error code if any failed
  const failed = coordinator.getFailedResults()
  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
