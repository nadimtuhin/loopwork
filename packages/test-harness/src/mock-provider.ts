import type {
  IMockProvider,
  MockCall,
  MockResponse,
} from '@loopwork-ai/contracts'

type MockHandler =
  | MockResponse
  | ((call: MockCall) => MockResponse | Promise<MockResponse>)

interface MockEntry {
  pattern: RegExp
  handler: MockHandler
}

/**
 * MockProvider - CLI mocking utility for tests
 *
 * Allows configuring mock responses for CLI tool invocations,
 * tracking calls made, and verifying expected interactions.
 */
export class MockProvider implements IMockProvider {
  readonly name: string
  private mocks: MockEntry[]
  private calls: MockCall[]

  constructor(name: string) {
    this.name = name
    this.mocks = []
    this.calls = []
  }

  mock(pattern: string | RegExp, response: MockResponse): void {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern)
    this.mocks.push({ pattern: regex, handler: response })
  }

  mockFn(
    pattern: string | RegExp,
    handler: (call: MockCall) => MockResponse | Promise<MockResponse>
  ): void {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern)
    this.mocks.push({ pattern: regex, handler })
  }

  unmock(pattern: string | RegExp): void {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern)
    this.mocks = this.mocks.filter(m => m.pattern.toString() !== regex.toString())
  }

  clearMocks(): void {
    this.mocks = []
  }

  getCalls(): MockCall[] {
    return [...this.calls]
  }

  clearCalls(): void {
    this.calls = []
  }

  hasMock(command: string): boolean {
    return this.mocks.some(m => m.pattern.test(command))
  }

  async execute(command: string, args: string[]): Promise<MockResponse> {
    const call: MockCall = {
      command,
      args,
      timestamp: Date.now(),
      cwd: process.cwd(),
      env: Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined)
      ) as Record<string, string>,
    }

    this.calls.push(call)

    for (const mock of this.mocks) {
      if (mock.pattern.test(command)) {
        if (typeof mock.handler === 'function') {
          return await mock.handler(call)
        }
        return mock.handler
      }
    }

    throw new Error(`No mock configured for command: ${command}`)
  }
}
