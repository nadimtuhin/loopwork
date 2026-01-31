import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'

export interface ControlApiAuthConfig {
  /** List of valid API keys. Can be simple strings or objects with metadata. */
  apiKeys?: (string | { key: string; name: string; rateLimit?: { windowMs: number; max: number } })[]
  /** JWT configuration */
  jwt?: {
    secret: string
    issuer?: string
    audience?: string
  }
  /** Default rate limit configuration */
  rateLimit?: {
    windowMs: number
    max: number
  }
}

export interface ControlApiConfig {
  /** The port the API server will listen on */
  port?: number
  /** The host the API server will bind to */
  host?: string
  /** Whether the API is enabled */
  enabled?: boolean
  /** API prefix (default: /api/v1) */
  prefix?: string
  /** Authentication configuration */
  auth?: ControlApiAuthConfig
}

export interface ControlApiContext {
  backend?: TaskBackend
  namespace?: string
  currentTaskId?: string
  config?: ControlApiConfig
}

export type ControlApiIdentity = {
  id: string
  name: string
  type: 'api-key' | 'jwt'
  payload?: any
  rateLimit?: {
    windowMs: number
    max: number
  }
}

export type HonoEnv = {
  Variables: {
    identity: ControlApiIdentity
  }
}
