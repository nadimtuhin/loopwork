/**
 * Model Capability and Role Type Contracts
 *
 * Defines types for capability-based model selection and role-based assignment.
 * Provides a formal type system for classifying models by capability level
 * and assigning them to specific engineering roles.
 */

/**
 * Model capability levels
 *
 * - high: Complex reasoning, architecture, deep debugging (e.g., Claude Opus)
 * - medium: Implementation, refactoring, standard tasks (e.g., Claude Sonnet)
 * - low: Simple fixes, documentation, small changes (e.g., Claude Haiku)
 */
export type ModelCapabilityLevel = 'high' | 'medium' | 'low'

/**
 * Extended capability levels for fine-grained classification
 *
 * Includes intermediate levels for more nuanced model selection
 */
export type ExtendedModelCapabilityLevel = ModelCapabilityLevel | 'very-high' | 'high-medium' | 'medium-low' | 'very-low'

/**
 * Engineering role types for model assignment
 *
 * Based on typical software engineering team roles with varying
 * capability requirements and responsibilities
 */
export type ModelRoleType =
  | 'architect'           // System design, complex architecture decisions
  | 'tech-lead'          // Technical leadership, code review, mentoring
  | 'senior-engineer'    // Complex implementation, refactoring
  | 'engineer'           // Standard implementation tasks
  | 'junior-engineer'    // Simple tasks, documentation, bug fixes
  | 'qa-engineer'        // Testing, quality assurance
  | 'devops-engineer'    // Infrastructure, CI/CD, deployment
  | 'security-engineer'  // Security audits, vulnerability assessment

/**
 * Task categories for capability matching
 *
 * Different task types require different capability levels
 */
export type TaskCategory =
  | 'architecture'       // System design, API design, database schema
  | 'implementation'     // Feature implementation, bug fixes
  | 'refactoring'        // Code restructuring, tech debt
  | 'testing'            // Test writing, test coverage
  | 'documentation'      // Docs, comments, README updates
  | 'debugging'          // Troubleshooting, root cause analysis
  | 'research'           // Spikes, exploration, prototyping
  | 'maintenance'        // Updates, dependency upgrades
  | 'security'           // Security fixes, audits
  | 'performance'        // Optimization, profiling

/**
 * Model capability definition
 *
 * Describes what a model is capable of and what tasks it's suited for
 */
export interface ModelCapability {
  /**
   * The capability level of this model
   */
  level: ModelCapabilityLevel

  /**
   * Extended capability level for fine-grained classification (optional)
   */
  extendedLevel?: ExtendedModelCapabilityLevel

  /**
   * Human-readable description of this capability level
   */
  description: string

  /**
   * Task categories this capability level is best suited for
   */
  suitableTasks: TaskCategory[]

  /**
   * Maximum recommended complexity for this capability level
   * Scale: 1-10, where 10 is most complex
   */
  maxComplexity: number

  /**
   * Typical use cases for this capability level
   */
  useCases: string[]

  /**
   * Cost weight for this capability level (1-100)
   * Higher capability typically means higher cost
   */
  costWeight: number
}

/**
 * Model role definition
 *
 * Describes an engineering role and its capability requirements
 */
export interface ModelRole {
  /**
   * The role type
   */
  type: ModelRoleType

  /**
   * Human-readable display name for this role
   */
  displayName: string

  /**
   * Detailed description of this role
   */
  description: string

  /**
   * Required minimum capability level for this role
   */
  requiredCapability: ModelCapabilityLevel

  /**
   * Recommended capability level for optimal performance
   */
  recommendedCapability?: ExtendedModelCapabilityLevel

  /**
   * Primary responsibilities of this role
   */
  responsibilities: string[]

  /**
   * Task categories this role typically handles
   */
  typicalTasks: TaskCategory[]

  /**
   * Whether this role can delegate to other roles
   */
  canDelegate: boolean

  /**
   * Roles this role can delegate to (if canDelegate is true)
   */
  delegateTo?: ModelRoleType[]
}

/**
 * Capability-based model configuration
 *
 * Extends the base ModelConfig with capability and role information
 */
export interface CapabilityModelConfig {
  /**
   * The capability level of this model
   */
  capability: ModelCapabilityLevel

  /**
   * Extended capability classification (optional)
   */
  extendedCapability?: ExtendedModelCapabilityLevel

  /**
   * The primary role this model is assigned to
   */
  primaryRole?: ModelRoleType

  /**
   * Additional roles this model can fulfill
   */
  secondaryRoles?: ModelRoleType[]

  /**
   * Task categories this model is optimized for
   */
  optimizedFor?: TaskCategory[]

  /**
   * Maximum complexity level this model can handle (1-10)
   */
  maxComplexity?: number
}

/**
 * Capability-based selection criteria
 *
 * Used when selecting models based on capability requirements
 */
export interface CapabilityCriteria {
  /**
   * Required minimum capability level
   */
  minCapability?: ModelCapabilityLevel

  /**
   * Preferred capability level
   */
  preferredCapability?: ExtendedModelCapabilityLevel

  /**
   * Required role type
   */
  requiredRole?: ModelRoleType

  /**
   * Task category to match against model capabilities
   */
  taskCategory?: TaskCategory

  /**
   * Complexity level of the task (1-10)
   */
  taskComplexity?: number

  /**
   * Maximum cost weight allowed (1-100)
   */
  maxCostWeight?: number

  /**
   * Whether to prefer lower cost models when multiple match
   */
  preferLowerCost?: boolean
}

/**
 * Result of capability-based model matching
 */
export interface CapabilityMatchResult {
  /**
   * Whether a suitable model was found
   */
  matched: boolean

  /**
   * The matched model configuration
   */
  model?: CapabilityModelConfig

  /**
   * The capability level of the matched model
   */
  matchedCapability?: ModelCapabilityLevel

  /**
   * Match score (0-100, higher is better)
   */
  score?: number

  /**
   * Reasons for the match decision
   */
  matchReasons: string[]

  /**
   * Alternative models that could also handle this task
   */
  alternatives?: CapabilityModelConfig[]
}

/**
 * Capability registry for managing model capabilities
 *
 * Provides a registry pattern similar to CapabilityRegistry but
 * specifically for model capabilities and roles
 */
export interface ModelCapabilityRegistry {
  /**
   * Register a capability definition
   */
  registerCapability(capability: ModelCapability): void

  /**
   * Register a role definition
   */
  registerRole(role: ModelRole): void

  /**
   * Get a capability by level
   */
  getCapability(level: ModelCapabilityLevel): ModelCapability | undefined

  /**
   * Get a role by type
   */
  getRole(type: ModelRoleType): ModelRole | undefined

  /**
   * Get all registered capabilities
   */
  getAllCapabilities(): ModelCapability[]

  /**
   * Get all registered roles
   */
  getAllRoles(): ModelRole[]

  /**
   * Find roles suitable for a given capability level
   */
  findRolesForCapability(level: ModelCapabilityLevel): ModelRole[]

  /**
   * Find capabilities suitable for a given task category
   */
  findCapabilitiesForTask(category: TaskCategory): ModelCapability[]

  /**
   * Check if a capability can handle a specific task complexity
   */
  canHandleComplexity(level: ModelCapabilityLevel, complexity: number): boolean
}

/**
 * Capability-based model selector interface
 *
 * Similar to ModelSelector but uses capability criteria instead of
 * just cycling through models
 */
export interface CapabilityBasedModelSelector {
  /**
   * Get the next model based on capability criteria
   */
  getNextByCapability(criteria: CapabilityCriteria): CapabilityMatchResult

  /**
   * Get the next model by role type
   */
  getNextByRole(roleType: ModelRoleType): CapabilityMatchResult

  /**
   * Get the next model for a specific task category
   */
  getNextForTaskCategory(category: TaskCategory): CapabilityMatchResult

  /**
   * Register a model with capability configuration
   */
  registerModel(model: CapabilityModelConfig): void

  /**
   * Get all registered models
   */
  getAllModels(): CapabilityModelConfig[]

  /**
   * Get models filtered by capability level
   */
  getModelsByCapability(level: ModelCapabilityLevel): CapabilityModelConfig[]

  /**
   * Get models filtered by role
   */
  getModelsByRole(role: ModelRoleType): CapabilityModelConfig[]

  /**
   * Reset the selector state
   */
  reset(): void
}

/**
 * Mapping between capability levels and their default configurations
 */
export const DEFAULT_CAPABILITIES: Record<ModelCapabilityLevel, ModelCapability> = {
  high: {
    level: 'high',
    extendedLevel: 'high',
    description: 'High capability model suitable for complex reasoning, architecture, and deep debugging',
    suitableTasks: ['architecture', 'debugging', 'research', 'security', 'performance'],
    maxComplexity: 10,
    useCases: [
      'System architecture design',
      'Complex debugging and root cause analysis',
      'Security audits',
      'Performance optimization',
      'Research spikes and prototyping'
    ],
    costWeight: 100
  },
  medium: {
    level: 'medium',
    extendedLevel: 'medium',
    description: 'Medium capability model suitable for implementation, refactoring, and standard tasks',
    suitableTasks: ['implementation', 'refactoring', 'testing', 'maintenance'],
    maxComplexity: 6,
    useCases: [
      'Feature implementation',
      'Code refactoring',
      'Test writing',
      'Bug fixes',
      'Documentation updates'
    ],
    costWeight: 30
  },
  low: {
    level: 'low',
    extendedLevel: 'low',
    description: 'Low capability model suitable for simple fixes, documentation, and small changes',
    suitableTasks: ['documentation', 'maintenance', 'testing'],
    maxComplexity: 3,
    useCases: [
      'Simple bug fixes',
      'Documentation updates',
      'README improvements',
      'Comment additions',
      'Minor formatting changes'
    ],
    costWeight: 10
  }
}

/**
 * Mapping between role types and their default configurations
 */
export const DEFAULT_ROLES: Record<ModelRoleType, ModelRole> = {
  architect: {
    type: 'architect',
    displayName: 'Architect',
    description: 'System architect focused on high-level design and complex technical decisions',
    requiredCapability: 'high',
    recommendedCapability: 'very-high',
    responsibilities: [
      'System architecture design',
      'API design and review',
      'Database schema design',
      'Technical decision making',
      'Complex problem solving'
    ],
    typicalTasks: ['architecture', 'research', 'security'],
    canDelegate: true,
    delegateTo: ['tech-lead', 'senior-engineer']
  },
  'tech-lead': {
    type: 'tech-lead',
    displayName: 'Tech Lead',
    description: 'Technical leader responsible for code quality, review, and team guidance',
    requiredCapability: 'high',
    recommendedCapability: 'high',
    responsibilities: [
      'Code review and quality assurance',
      'Technical mentoring',
      'Architecture guidance',
      'Best practice enforcement',
      'Team technical decisions'
    ],
    typicalTasks: ['architecture', 'implementation', 'refactoring', 'testing'],
    canDelegate: true,
    delegateTo: ['senior-engineer', 'engineer']
  },
  'senior-engineer': {
    type: 'senior-engineer',
    displayName: 'Senior Engineer',
    description: 'Senior engineer capable of complex implementation and refactoring',
    requiredCapability: 'medium',
    recommendedCapability: 'high-medium',
    responsibilities: [
      'Complex feature implementation',
      'Code refactoring and tech debt',
      'Performance optimization',
      'Mentoring junior engineers',
      'Technical documentation'
    ],
    typicalTasks: ['implementation', 'refactoring', 'testing', 'performance'],
    canDelegate: true,
    delegateTo: ['engineer', 'junior-engineer']
  },
  engineer: {
    type: 'engineer',
    displayName: 'Engineer',
    description: 'Software engineer handling standard implementation tasks',
    requiredCapability: 'medium',
    recommendedCapability: 'medium',
    responsibilities: [
      'Feature implementation',
      'Bug fixing',
      'Test writing',
      'Code maintenance',
      'Documentation'
    ],
    typicalTasks: ['implementation', 'testing', 'documentation', 'maintenance'],
    canDelegate: false
  },
  'junior-engineer': {
    type: 'junior-engineer',
    displayName: 'Junior Engineer',
    description: 'Junior engineer handling simple tasks and learning',
    requiredCapability: 'low',
    recommendedCapability: 'medium-low',
    responsibilities: [
      'Simple bug fixes',
      'Documentation updates',
      'Test writing',
      'Code formatting',
      'Learning and growth'
    ],
    typicalTasks: ['documentation', 'testing', 'maintenance'],
    canDelegate: false
  },
  'qa-engineer': {
    type: 'qa-engineer',
    displayName: 'QA Engineer',
    description: 'Quality assurance engineer focused on testing and quality',
    requiredCapability: 'medium',
    recommendedCapability: 'medium',
    responsibilities: [
      'Test case design',
      'Test implementation',
      'Quality assurance',
      'Bug verification',
      'Test coverage improvement'
    ],
    typicalTasks: ['testing', 'debugging'],
    canDelegate: true,
    delegateTo: ['junior-engineer']
  },
  'devops-engineer': {
    type: 'devops-engineer',
    displayName: 'DevOps Engineer',
    description: 'DevOps engineer handling infrastructure and deployment',
    requiredCapability: 'medium',
    recommendedCapability: 'high-medium',
    responsibilities: [
      'CI/CD pipeline management',
      'Infrastructure configuration',
      'Deployment automation',
      'Monitoring setup',
      'Environment management'
    ],
    typicalTasks: ['implementation', 'maintenance', 'performance'],
    canDelegate: false
  },
  'security-engineer': {
    type: 'security-engineer',
    displayName: 'Security Engineer',
    description: 'Security engineer focused on audits and vulnerability assessment',
    requiredCapability: 'high',
    recommendedCapability: 'high',
    responsibilities: [
      'Security audits',
      'Vulnerability assessment',
      'Security best practices',
      'Compliance checking',
      'Security documentation'
    ],
    typicalTasks: ['security', 'architecture', 'research'],
    canDelegate: true,
    delegateTo: ['senior-engineer']
  }
}

/**
 * Task category to recommended capability mapping
 */
export const TASK_CATEGORY_CAPABILITY_MAP: Record<TaskCategory, ModelCapabilityLevel> = {
  architecture: 'high',
  implementation: 'medium',
  refactoring: 'medium',
  testing: 'low',
  documentation: 'low',
  debugging: 'high',
  research: 'high',
  maintenance: 'low',
  security: 'high',
  performance: 'high'
}
