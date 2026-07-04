import { logger } from '@loopwork-ai/common'

export { logger }

export const DEFAULT_LOCK_TIMEOUT_MS = 5000
export const LOCK_STALE_TIMEOUT_MS = 30000
export const LOCK_RETRY_DELAY_MS = 100

export class LoopworkError extends Error {
  constructor(
    public code: string,
    message: string,
    public suggestions?: string[]
  ) {
    super(message)
    this.name = 'LoopworkError'
  }
}
