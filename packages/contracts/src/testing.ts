/**
 * Testing Harness Contracts
 *
 * Standardized interfaces for the testing system.
 * Provides abstractions for mocking, test environment management,
 * and virtual file system operations.
 */

/**
 * Mock response configuration for CLI outputs
 */
export interface MockResponse {
  /** The output content to return */
  output: string

  /** Exit code for the mock execution (0 = success) */
  exitCode: number

  /** Optional error message */
  error?: string

  /** Delay in milliseconds before returning the response */
  delayMs?: number
}

/**
 * Call record for tracking mock invocations
 */
export interface MockCall {
  /** The command that was invoked */
  command: string

  /** Arguments passed to the command */
  args: string[]

  /** Timestamp when the call was made */
  timestamp: number

  /** Working directory at time of call */
  cwd?: string

  /** Environment variables during the call */
  env?: Record<string, string>
}

/**
 * IMockProvider - Interface for mocking CLI outputs
 *
 * Defines methods for configuring and controlling mock responses
 * for CLI tool invocations in tests.
 */
export interface IMockProvider {
  /** Unique identifier for this mock provider */
  readonly name: string

  /**
   * Configure a mock response for a specific command pattern
   * @param pattern - Command pattern to match (string or regex)
   * @param response - Mock response to return
   */
  mock(pattern: string | RegExp, response: MockResponse): void

  /**
   * Configure a mock response using a function
   * @param pattern - Command pattern to match
   * @param handler - Function that returns a mock response
   */
  mockFn(pattern: string | RegExp, handler: (call: MockCall) => MockResponse | Promise<MockResponse>): void

  /**
   * Remove a specific mock configuration
   * @param pattern - Command pattern to unmock
   */
  unmock(pattern: string | RegExp): void

  /**
   * Remove all mock configurations
   */
  clearMocks(): void

  /**
   * Get all recorded calls made to this mock
   */
  getCalls(): MockCall[]

  /**
   * Clear the call history
   */
  clearCalls(): void

  /**
   * Check if a command matches any configured mock
   * @param command - Command to check
   * @returns True if a mock exists for this command
   */
  hasMock(command: string): boolean

  /**
   * Execute a mock for the given command
   * @param command - Command being executed
   * @param args - Arguments passed to command
   * @returns The configured mock response
   * @throws Error if no mock is configured for the command
   */
  execute(command: string, args: string[]): Promise<MockResponse>
}

/**
 * Test context passed to setup and teardown
 */
export interface TestContext {
  /** Unique identifier for this test run */
  testId: string

  /** Working directory for the test */
  workingDir: string

  /** Environment variables for the test */
  env: Record<string, string>

  /** Custom metadata that can be shared between setup and teardown */
  metadata: Map<string, unknown>
}

/**
 * Result of a setup operation
 */
export interface SetupResult {
  /** Whether setup completed successfully */
  success: boolean

  /** Error message if setup failed */
  error?: string

  /** Data to pass to the test and teardown */
  context?: Partial<TestContext>
}

/**
 * Result of a teardown operation
 */
export interface TeardownResult {
  /** Whether teardown completed successfully */
  success: boolean

  /** Error message if teardown failed */
  error?: string

  /** Whether cleanup was fully completed */
  cleanupComplete: boolean
}

/**
 * Test configuration options
 */
export interface TestEnvironmentOptions {
  /** Timeout in milliseconds for setup operations */
  setupTimeoutMs?: number

  /** Timeout in milliseconds for teardown operations */
  teardownTimeoutMs?: number

  /** Whether to automatically cleanup on teardown */
  autoCleanup?: boolean

  /** Whether to capture logs during test execution */
  captureLogs?: boolean

  /** Custom environment variables to set */
  env?: Record<string, string>
}

/**
 * ITestEnvironment - Interface for test setup and teardown
 *
 * Defines the contract for managing test environment lifecycle
 * with support for async operations.
 */
export interface ITestEnvironment {
  /** Unique name for this test environment */
  readonly name: string

  /**
   * Initialize the test environment
   * Called once before all tests in a suite
   * @param options - Configuration options
   */
  initialize(options?: TestEnvironmentOptions): Promise<SetupResult>

  /**
   * Setup the environment for a single test
   * Called before each test
   * @param context - Current test context
   */
  setup(context: TestContext): Promise<SetupResult>

  /**
   * Teardown the environment after a single test
   * Called after each test
   * @param context - Current test context
   */
  teardown(context: TestContext): Promise<TeardownResult>

  /**
   * Final cleanup of the test environment
   * Called once after all tests complete
   */
  finalize(): Promise<TeardownResult>

  /**
   * Get the current test context
   */
  getContext(): TestContext | null

  /**
   * Check if environment is initialized
   */
  isInitialized(): boolean
}

/**
 * File metadata for virtual file system entries
 */
export interface VirtualFileMetadata {
  /** Size in bytes */
  size: number

  /** Creation timestamp */
  createdAt: number

  /** Last modification timestamp */
  modifiedAt: number

  /** File permissions (Unix-style) */
  mode?: number

  /** Whether this is a directory */
  isDirectory: boolean
}

/**
 * Options for virtual file operations
 */
export interface VirtualFileOptions {
  /** Create parent directories if they don't exist */
  recursive?: boolean

  /** File permissions to set */
  mode?: number

  /** Encoding for read/write operations */
  encoding?: BufferEncoding
}

/**
 * IVirtualFileSystem - Interface for virtual file system operations
 *
 * Provides an abstraction layer for file system operations in tests,
 * enabling isolated file system environments without touching the real disk.
 */
export interface IVirtualFileSystem {
  /** Unique identifier for this virtual file system instance */
  readonly id: string

  /**
   * Read file contents
   * @param path - Path to the file
   * @param options - Read options
   * @returns File contents as string
   * @throws Error if file doesn't exist
   */
  readFile(path: string, options?: VirtualFileOptions): string

  /**
   * Read file contents asynchronously
   * @param path - Path to the file
   * @param options - Read options
   * @returns Promise resolving to file contents
   */
  readFileAsync(path: string, options?: VirtualFileOptions): Promise<string>

  /**
   * Write data to a file
   * @param path - Path to the file
   * @param content - Content to write
   * @param options - Write options
   */
  writeFile(path: string, content: string, options?: VirtualFileOptions): void

  /**
   * Write data to a file asynchronously
   * @param path - Path to the file
   * @param content - Content to write
   * @param options - Write options
   */
  writeFileAsync(path: string, content: string, options?: VirtualFileOptions): Promise<void>

  /**
   * Check if a file or directory exists
   * @param path - Path to check
   * @returns True if the path exists
   */
  exists(path: string): boolean

  /**
   * Delete a file or directory
   * @param path - Path to delete
   * @param options - Delete options (recursive for directories)
   */
  delete(path: string, options?: { recursive?: boolean }): void

  /**
   * Delete a file or directory asynchronously
   * @param path - Path to delete
   * @param options - Delete options
   */
  deleteAsync(path: string, options?: { recursive?: boolean }): Promise<void>

  /**
   * Create a directory
   * @param path - Path to create
   * @param options - Create options
   */
  mkdir(path: string, options?: VirtualFileOptions): void

  /**
   * Create a directory asynchronously
   * @param path - Path to create
   * @param options - Create options
   */
  mkdirAsync(path: string, options?: VirtualFileOptions): Promise<void>

  /**
   * List directory contents
   * @param path - Directory path
   * @returns Array of entry names
   */
  readdir(path: string): string[]

  /**
   * List directory contents asynchronously
   * @param path - Directory path
   * @returns Promise resolving to array of entry names
   */
  readdirAsync(path: string): Promise<string[]>

  /**
   * Get file or directory metadata
   * @param path - Path to stat
   * @returns Metadata object
   */
  stat(path: string): VirtualFileMetadata

  /**
   * Get file or directory metadata asynchronously
   * @param path - Path to stat
   * @returns Promise resolving to metadata
   */
  statAsync(path: string): Promise<VirtualFileMetadata>

  /**
   * Copy a file or directory
   * @param src - Source path
   * @param dest - Destination path
   * @param options - Copy options
   */
  copy(src: string, dest: string, options?: { recursive?: boolean }): void

  /**
   * Move/rename a file or directory
   * @param src - Source path
   * @param dest - Destination path
   */
  move(src: string, dest: string): void

  /**
   * Get the absolute path relative to the VFS root
   * @param path - Relative or absolute path
   * @returns Absolute path
   */
  resolve(path: string): string

  /**
   * Reset the virtual file system to empty state
   */
  reset(): void

  /**
   * Get all file paths in the VFS
   * @returns Array of all file paths
   */
  getAllPaths(): string[]

  /**
   * Mount another VFS or real directory at a path
   * @param path - Mount point
   * @param source - Source VFS instance or real directory path
   */
  mount(path: string, source: IVirtualFileSystem | string): void
}

/**
 * Factory for creating test harness components
 */
export interface ITestHarnessFactory {
  /**
   * Create a new mock provider
   * @param name - Name for the mock provider
   */
  createMockProvider(name: string): IMockProvider

  /**
   * Create a new test environment
   * @param name - Name for the test environment
   * @param options - Environment options
   */
  createTestEnvironment(name: string, options?: TestEnvironmentOptions): ITestEnvironment

  /**
   * Create a new virtual file system
   * @param id - Identifier for the VFS
   * @param initialContents - Optional initial file contents
   */
  createVirtualFileSystem(id: string, initialContents?: Record<string, string>): IVirtualFileSystem
}
