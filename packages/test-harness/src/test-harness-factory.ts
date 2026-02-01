import type {
  ITestHarnessFactory,
  TestEnvironmentOptions,
} from '@loopwork-ai/contracts'
import { MockProvider } from './mock-provider'
import { TestEnvironment } from './test-environment'
import { VirtualFileSystem } from './virtual-file-system'

/**
 * TestHarnessFactory - Factory for creating test harness components
 *
 * Provides factory methods for creating mock providers, test environments,
 * and virtual file systems for testing.
 */
export class TestHarnessFactory implements ITestHarnessFactory {
  private static instance: TestHarnessFactory

  static getInstance(): TestHarnessFactory {
    if (!TestHarnessFactory.instance) {
      TestHarnessFactory.instance = new TestHarnessFactory()
    }
    return TestHarnessFactory.instance
  }

  createMockProvider(name: string): MockProvider {
    return new MockProvider(name)
  }

  createTestEnvironment(
    name: string,
    options?: TestEnvironmentOptions
  ): TestEnvironment {
    return new TestEnvironment(name, options)
  }

  createVirtualFileSystem(
    id: string,
    initialContents?: Record<string, string>
  ): VirtualFileSystem {
    return new VirtualFileSystem(id, initialContents)
  }
}

export const testHarnessFactory = TestHarnessFactory.getInstance()
