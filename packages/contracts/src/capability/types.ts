
export type ModelCapabilityLevel = 'high' | 'medium' | 'low'

export type ExtendedModelCapabilityLevel = ModelCapabilityLevel | 'very-high' | 'high-medium' | 'medium-low' | 'very-low'

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
