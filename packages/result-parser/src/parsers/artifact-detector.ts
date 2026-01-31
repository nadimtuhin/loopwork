import type { IArtifactDetector, ParseContext } from '../contracts'
import type { Artifact } from '../contracts'

export class ArtifactDetector implements IArtifactDetector {
  async parse(output: string, context: ParseContext): Promise<Artifact[]> {
    if (!context.gitRunner) {
      return []
    }

    const artifacts: Artifact[] = []

    // Get file status changes
    const nameStatus = await context.gitRunner.diff(['--name-status'])
    const lines = nameStatus.trim().split('\n').filter(Boolean)

    for (const line of lines) {
      const [status, path] = line.split('\t')
      if (!status || !path) continue

      const artifact: Artifact = {
        path,
        action: this.mapStatusToAction(status),
      }

      artifacts.push(artifact)
    }

    // Get line stats if we have artifacts
    if (artifacts.length > 0) {
      try {
        const numstat = await context.gitRunner.diff(['--numstat'])
        const statLines = numstat.trim().split('\n').filter(Boolean)

        for (const statLine of statLines) {
          const [added, removed, filePath] = statLine.split('\t')
          const artifact = artifacts.find(a => a.path === filePath)
          if (artifact && added !== '-' && removed !== '-') {
            artifact.linesAdded = parseInt(added, 10)
            artifact.linesRemoved = parseInt(removed, 10)
          }
        }
      } catch {
        // numstat is optional, ignore errors
      }
    }

    return artifacts
  }

  private mapStatusToAction(status: string): Artifact['action'] {
    switch (status.charAt(0).toUpperCase()) {
      case 'A':
        return 'created'
      case 'D':
        return 'deleted'
      case 'M':
      case 'R':
      case 'C':
      default:
        return 'modified'
    }
  }
}
