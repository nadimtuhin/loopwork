import type { IResultParser } from '../contracts'
import { CompositeResultParser } from '../core/composite-parser'

export interface ParserOptions {
  // Future options for customization
  customPatterns?: {
    todoPatterns?: RegExp[]
    tokenPatterns?: RegExp[]
  }
}

/**
 * Creates a result parser with optional customization.
 * Default creates a CompositeResultParser with standard sub-parsers.
 */
export function createResultParser(options?: ParserOptions): IResultParser {
  // For now, return the default composite parser
  // Future: support custom patterns and sub-parser injection
  return new CompositeResultParser()
}
