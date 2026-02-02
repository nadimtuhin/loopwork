export interface IEmbeddingProvider {
  readonly name: string
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

export interface IEmbeddingConfig {
  apiKey?: string
  model?: string
  dimensions?: number
  baseUrl?: string
  timeoutMs?: number
}
