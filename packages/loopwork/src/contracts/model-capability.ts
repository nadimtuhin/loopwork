import type { ModelConfig } from '@loopwork-ai/contracts'

export type ModelCapabilityLevel = 'low' | 'medium' | 'high'
export type ExtendedModelCapabilityLevel = ModelCapabilityLevel | 'very-high'

export type ModelRoleType = 
  | 'architect'
  | 'tech-lead'
  | 'senior-engineer'
  | 'engineer'
  | 'junior-engineer'
  | 'qa-engineer'
  | 'devops-engineer'
  | 'security-engineer'

export type TaskCategory = 
  | 'architecture'
  | 'implementation'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'debugging'
  | 'research'
  | 'maintenance'
  | 'security'
  | 'performance'

export interface ModelCapability {
  level: ModelCapabilityLevel
  description: string
  maxComplexity: number
  costWeight: number
  suitableTasks: string[]
  useCases: string[]
  recommendedFor: string
}

export interface ModelRole {
  type: ModelRoleType
  displayName: string
  description: string
  requiredCapability: ModelCapabilityLevel
  canDelegate: boolean
  delegateTo: string[]
  recommendedCapability: ExtendedModelCapabilityLevel
}

export interface CapabilityModelConfig extends ModelConfig {
  capability: ModelCapabilityLevel
  extendedCapability?: ExtendedModelCapabilityLevel
  primaryRole?: ModelRoleType
  secondaryRoles?: ModelRoleType[]
  maxComplexity?: number
  costWeight?: number
  optimizedFor?: TaskCategory[]
}

export interface CapabilityCriteria {
  minCapability?: ModelCapabilityLevel
  preferredCapability?: ModelCapabilityLevel
  requiredRole?: ModelRoleType
  taskCategory?: TaskCategory
  taskComplexity?: number
  maxCostWeight?: number
  preferLowerCost?: boolean
}

export interface CapabilityMatchResult {
  matched: boolean
  model?: CapabilityModelConfig
  matchedCapability?: ModelCapabilityLevel
  score?: number
  matchReasons: string[]
  alternatives: CapabilityModelConfig[]
}

export interface ModelCapabilityRegistry {
  registerCapability(capability: ModelCapability): void
  registerRole(role: ModelRole): void
  getCapability(level: ModelCapabilityLevel): ModelCapability | undefined
  getRole(type: ModelRoleType): ModelRole | undefined
  getAllCapabilities(): ModelCapability[]
  getAllRoles(): ModelRole[]
  findRolesForCapability(level: ModelCapabilityLevel): ModelRole[]
  findCapabilitiesForTask(category: TaskCategory): ModelCapability[]
  canHandleComplexity(level: ModelCapabilityLevel, complexity: number): boolean
}

export interface CapabilityBasedModelSelector {
  registerModel(model: CapabilityModelConfig): void
  getAllModels(): CapabilityModelConfig[]
  getModelsByCapability(level: ModelCapabilityLevel): CapabilityModelConfig[]
  getModelsByRole(role: ModelRoleType): CapabilityModelConfig[]
  reset(): void
  getNextByCapability(criteria: CapabilityCriteria): CapabilityMatchResult
  getNextByRole(roleType: ModelRoleType): CapabilityMatchResult
  getNextForTaskCategory(category: TaskCategory): CapabilityMatchResult
}

export const DEFAULT_CAPABILITIES: Record<ModelCapabilityLevel, ModelCapability> = {
  high: {
    level: 'high',
    description: 'High capability model for complex tasks',
    maxComplexity: 10,
    costWeight: 100,
    suitableTasks: ['architecture', 'debugging', 'research', 'maintenance', 'security', 'performance'],
    useCases: ['System architecture design', 'Deep debugging', 'Research & analysis', 'Maintenance & updates', 'Security audits', 'Performance optimization'],
    recommendedFor: 'Tech Lead, Senior Engineer',
  },
  medium: {
    level: 'medium',
    description: 'Medium capability model for standard tasks',
    maxComplexity: 6,
    costWeight: 30,
    suitableTasks: ['implementation', 'refactoring', 'testing', 'documentation', 'maintenance'],
    useCases: ['Feature implementation', 'Code refactoring', 'Testing & QA', 'Documentation', 'Bug fixes'],
    recommendedFor: 'Senior Engineer, Tech Lead',
  },
  low: {
    level: 'low',
    description: 'Low capability model for simple tasks',
    maxComplexity: 3,
    costWeight: 10,
    suitableTasks: ['testing', 'documentation', 'bug fixes', 'code review'],
    useCases: ['Unit testing', 'Writing documentation', 'Simple bug fixes', 'Code reviews'],
    recommendedFor: 'Junior Engineer',
  },
}

export const DEFAULT_ROLES: Record<string, ModelRole> = {
  'architect': {
    type: 'architect',
    displayName: 'Architect',
    description: 'System architect and technical lead',
    requiredCapability: 'high',
    canDelegate: true,
    delegateTo: ['tech-lead', 'senior-engineer'],
    recommendedCapability: 'very-high',
  },
  'tech-lead': {
    type: 'tech-lead',
    displayName: 'Tech Lead',
    description: 'Technical lead and engineering manager',
    requiredCapability: 'high',
    canDelegate: true,
    delegateTo: ['architect', 'senior-engineer'],
    recommendedCapability: 'high',
  },
  'senior-engineer': {
    type: 'senior-engineer',
    displayName: 'Senior Engineer',
    description: 'Senior software engineer',
    requiredCapability: 'medium',
    canDelegate: true,
    delegateTo: ['junior-engineer', 'engineer'],
    recommendedCapability: 'medium',
  },
  'engineer': {
    type: 'engineer',
    displayName: 'Engineer',
    description: 'Software engineer',
    requiredCapability: 'low',
    canDelegate: true,
    delegateTo: [],
    recommendedCapability: 'low',
  },
  'junior-engineer': {
    type: 'junior-engineer',
    displayName: 'Junior Engineer',
    description: 'Junior software engineer',
    requiredCapability: 'low',
    canDelegate: false,
    delegateTo: [],
    recommendedCapability: 'low',
  },
  'qa-engineer': {
    type: 'qa-engineer',
    displayName: 'QA Engineer',
    description: 'Quality assurance engineer',
    requiredCapability: 'medium',
    canDelegate: false,
    delegateTo: [],
    recommendedCapability: 'medium',
  },
  'devops-engineer': {
    type: 'devops-engineer',
    displayName: 'DevOps Engineer',
    description: 'DevOps and infrastructure engineer',
    requiredCapability: 'medium',
    canDelegate: false,
    delegateTo: [],
    recommendedCapability: 'medium',
  },
  'security-engineer': {
    type: 'security-engineer',
    displayName: 'Security Engineer',
    description: 'Security and vulnerability specialist',
    requiredCapability: 'high',
    canDelegate: false,
    delegateTo: [],
    recommendedCapability: 'high',
  },
}

export const TASK_CATEGORY_CAPABILITY_MAP: Record<string, ModelCapabilityLevel> = {
  'architecture': 'high',
  'implementation': 'medium',
  'refactoring': 'medium',
  'testing': 'low',
  'documentation': 'low',
  'debugging': 'high',
  'research': 'high',
  'maintenance': 'medium',
  'security': 'high',
  'performance': 'high',
}
