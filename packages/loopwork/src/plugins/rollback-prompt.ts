import { logger } from '../core/utils'

export interface RollbackSelection {
  action: 'all' | 'none' | 'selective'
  files?: string[]
}

/**
 * Prompts the user for rollback action
 */
export async function promptForRollback(changedFiles: string[]): Promise<RollbackSelection> {
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    // Helper to cleanup and resolve
    const finish = (result: RollbackSelection) => {
      rl.close()
      resolve(result)
    }

    console.log('\n⚠️  Task failed with changes to the following files:')
    changedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`)
    })
    console.log('')

    rl.question('Rollback changes? [Y/n/s(selective)] ', (answer: string) => {
      const choice = answer.toLowerCase().trim()

      if (choice === 'n') {
        finish({ action: 'none' })
        return
      }

      if (choice === 's') {
        rl.question('Enter file numbers to rollback (comma separated, e.g. "1, 3"): ', (selection: string) => {
          const indices = selection.split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0 && n <= changedFiles.length)
          
          if (indices.length === 0) {
            console.log('No valid files selected. Cancelling rollback.')
            finish({ action: 'none' })
            return
          }

          const selectedFiles = indices.map(i => changedFiles[i - 1])
          finish({ action: 'selective', files: selectedFiles })
        })
        return
      }

      // Default is Yes (all)
      finish({ action: 'all' })
    })
  })
}
