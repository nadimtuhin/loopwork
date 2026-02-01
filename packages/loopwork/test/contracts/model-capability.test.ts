import { describe, test, expect } from 'bun:test'
import { ModelCapabilityLevel, ExtendedModelCapabilityLevel, ModelRoleType, ModelCapability, ModelRole, CapabilityModelConfig, CapabilityCriteria, CapabilityMatchResult, DEFAULT_CAPABILITIES, DEFAULT_ROLES, TASK_CATEGORY_CAPABILITY_MAP,  } from '../../src/contracts/model-capability'

describe('ModelCapabilityContracts', () => {
  describe('Type definitions', () => {
    test('ModelCapabilityLevel accepts valid values', () => {
      const high: ModelCapabilityLevel = 'high'
      const medium: ModelCapabilityLevel = 'medium'
      const low: ModelCapabilityLevel = 'low'

      expect(high).toBe('high')
      expect(medium).toBe('medium')
      expect(low).toBe('low')
    })

    test('ExtendedModelCapabilityLevel accepts valid values', () => {
      const veryHigh: ExtendedModelCapabilityLevel = 'very-high'
      const highMedium: ExtendedModelCapabilityLevel = 'high-medium'
      const mediumLow: ExtendedModelCapabilityLevel = 'medium-low'
      const veryLow: ExtendedModelCapabilityLevel = 'very-low'

      expect(veryHigh).toBe('very-high')
      expect(highMedium).toBe('high-medium')
      expect(mediumLow).toBe('medium-low')
      expect(veryLow).toBe('very-low')
    })

    test('ModelRoleType accepts all role values', () => {
      const roles: ModelRoleType[] = [
        'architect',
        'tech-lead',
        'senior-engineer',
        'engineer',
        'junior-engineer',
        'qa-engineer',
        'devops-engineer',
        'security-engineer'
      ]

      expect(roles).toHaveLength(8)
      expect(roles).toContain('architect')
      expect(roles).toContain('security-engineer')
    })

    test('TaskCategory accepts all category values', () => {
      const categories: TaskCategory[] = [
        'architecture',
        'implementation',
        'refactoring',
        'testing',
        'documentation',
        'debugging',
        'research',
        'maintenance',
        'security',
        'performance'
      ]

      expect(categories).toHaveLength(10)
      expect(categories).toContain('architecture')
      expect(categories).toContain('performance')
    })
  })

  describe('ModelCapability interface', () => {
    test('can create a valid ModelCapability object', () => {
      const capability: ModelCapability = {
        level: 'high',
        extendedLevel: 'very-high',
        description: 'High capability model for complex tasks',
        suitableTasks: ['architecture', 'debugging'],
        maxComplexity: 10,
        useCases: ['System design', 'Complex debugging'],
        costWeight: 100
      }

      expect(capability.level).toBe('high')
      expect(capability.maxComplexity).toBe(10)
      expect(capability.costWeight).toBe(100)
    })

    test('extendedLevel is optional', () => {
      const capability: ModelCapability = {
        level: 'medium',
        description: 'Medium capability',
        suitableTasks: ['implementation'],
        maxComplexity: 6,
        useCases: ['Standard tasks'],
        costWeight: 30
      }

      expect(capability.extendedLevel).toBeUndefined()
    })
  })

  describe('ModelRole interface', () => {
    test('can create a valid ModelRole object', () => {
      const role: ModelRole = {
        type: 'architect',
        displayName: 'Architect',
        description: 'System architect',
        requiredCapability: 'high',
        recommendedCapability: 'very-high',
        responsibilities: ['Design systems', 'Make technical decisions'],
        typicalTasks: ['architecture', 'research'],
        canDelegate: true,
        delegateTo: ['tech-lead', 'senior-engineer']
      }

      expect(role.type).toBe('architect')
      expect(role.canDelegate).toBe(true)
      expect(role.delegateTo).toHaveLength(2)
    })

    test('delegateTo is optional when canDelegate is false', () => {
      const role: ModelRole = {
        type: 'junior-engineer',
        displayName: 'Junior Engineer',
        description: 'Junior level engineer',
        requiredCapability: 'low',
        responsibilities: ['Simple tasks'],
        typicalTasks: ['documentation'],
        canDelegate: false
      }

      expect(role.canDelegate).toBe(false)
      expect(role.delegateTo).toBeUndefined()
    })

    test('recommendedCapability is optional', () => {
      const role: ModelRole = {
        type: 'engineer',
        displayName: 'Engineer',
        description: 'Software engineer',
        requiredCapability: 'medium',
        responsibilities: ['Implementation'],
        typicalTasks: ['implementation'],
        canDelegate: false
      }

      expect(role.recommendedCapability).toBeUndefined()
    })
  })

  describe('CapabilityModelConfig interface', () => {
    test('can create a valid CapabilityModelConfig', () => {
      const config: CapabilityModelConfig = {
        capability: 'high',
        extendedCapability: 'very-high',
        primaryRole: 'architect',
        secondaryRoles: ['tech-lead'],
        optimizedFor: ['architecture', 'research'],
        maxComplexity: 10
      }

      expect(config.capability).toBe('high')
      expect(config.primaryRole).toBe('architect')
      expect(config.secondaryRoles).toHaveLength(1)
    })

    test('optional fields can be omitted', () => {
      const config: CapabilityModelConfig = {
        capability: 'medium'
      }

      expect(config.capability).toBe('medium')
      expect(config.primaryRole).toBeUndefined()
      expect(config.secondaryRoles).toBeUndefined()
    })
  })

  describe('CapabilityCriteria interface', () => {
    test('can create full CapabilityCriteria', () => {
      const criteria: CapabilityCriteria = {
        minCapability: 'medium',
        preferredCapability: 'high',
        requiredRole: 'senior-engineer',
        taskCategory: 'implementation',
        taskComplexity: 5,
        maxCostWeight: 50,
        preferLowerCost: true
      }

      expect(criteria.minCapability).toBe('medium')
      expect(criteria.taskComplexity).toBe(5)
      expect(criteria.preferLowerCost).toBe(true)
    })

    test('can create minimal CapabilityCriteria', () => {
      const criteria: CapabilityCriteria = {
        taskCategory: 'documentation'
      }

      expect(criteria.taskCategory).toBe('documentation')
      expect(criteria.minCapability).toBeUndefined()
    })
  })

  describe('CapabilityMatchResult interface', () => {
    test('successful match result', () => {
      const modelConfig: CapabilityModelConfig = {
        capability: 'high',
        primaryRole: 'architect'
      }

      const result: CapabilityMatchResult = {
        matched: true,
        model: modelConfig,
        matchedCapability: 'high',
        score: 95,
        matchReasons: ['High capability matches requirement', 'Role matches'],
        alternatives: []
      }

      expect(result.matched).toBe(true)
      expect(result.score).toBe(95)
      expect(result.matchReasons).toHaveLength(2)
    })

    test('failed match result', () => {
      const result: CapabilityMatchResult = {
        matched: false,
        matchReasons: ['No models meet minimum capability requirement']
      }

      expect(result.matched).toBe(false)
      expect(result.model).toBeUndefined()
      expect(result.score).toBeUndefined()
    })
  })

  describe('DEFAULT_CAPABILITIES', () => {
    test('has all three capability levels defined', () => {
      expect(DEFAULT_CAPABILITIES.high).toBeDefined()
      expect(DEFAULT_CAPABILITIES.medium).toBeDefined()
      expect(DEFAULT_CAPABILITIES.low).toBeDefined()
    })

    test('high capability has correct properties', () => {
      const high = DEFAULT_CAPABILITIES.high

      expect(high.level).toBe('high')
      expect(high.maxComplexity).toBe(10)
      expect(high.costWeight).toBe(100)
      expect(high.suitableTasks).toContain('architecture')
      expect(high.suitableTasks).toContain('debugging')
      expect(high.useCases).toContain('System architecture design')
    })

    test('medium capability has correct properties', () => {
      const medium = DEFAULT_CAPABILITIES.medium

      expect(medium.level).toBe('medium')
      expect(medium.maxComplexity).toBe(6)
      expect(medium.costWeight).toBe(30)
      expect(medium.suitableTasks).toContain('implementation')
      expect(medium.suitableTasks).toContain('refactoring')
    })

    test('low capability has correct properties', () => {
      const low = DEFAULT_CAPABILITIES.low

      expect(low.level).toBe('low')
      expect(low.maxComplexity).toBe(3)
      expect(low.costWeight).toBe(10)
      expect(low.suitableTasks).toContain('documentation')
      expect(low.suitableTasks).toContain('testing')
    })

    test('capabilities have increasing cost weights', () => {
      expect(DEFAULT_CAPABILITIES.low.costWeight).toBeLessThan(DEFAULT_CAPABILITIES.medium.costWeight)
      expect(DEFAULT_CAPABILITIES.medium.costWeight).toBeLessThan(DEFAULT_CAPABILITIES.high.costWeight)
    })
  })

  describe('DEFAULT_ROLES', () => {
    test('has all eight roles defined', () => {
      expect(DEFAULT_ROLES.architect).toBeDefined()
      expect(DEFAULT_ROLES['tech-lead']).toBeDefined()
      expect(DEFAULT_ROLES['senior-engineer']).toBeDefined()
      expect(DEFAULT_ROLES.engineer).toBeDefined()
      expect(DEFAULT_ROLES['junior-engineer']).toBeDefined()
      expect(DEFAULT_ROLES['qa-engineer']).toBeDefined()
      expect(DEFAULT_ROLES['devops-engineer']).toBeDefined()
      expect(DEFAULT_ROLES['security-engineer']).toBeDefined()
    })

    test('architect role has correct properties', () => {
      const architect = DEFAULT_ROLES.architect

      expect(architect.type).toBe('architect')
      expect(architect.displayName).toBe('Architect')
      expect(architect.requiredCapability).toBe('high')
      expect(architect.recommendedCapability).toBe('very-high')
      expect(architect.canDelegate).toBe(true)
      expect(architect.delegateTo).toContain('tech-lead')
      expect(architect.delegateTo).toContain('senior-engineer')
    })

    test('junior-engineer cannot delegate', () => {
      const junior = DEFAULT_ROLES['junior-engineer']

      expect(junior.type).toBe('junior-engineer')
      expect(junior.requiredCapability).toBe('low')
      expect(junior.canDelegate).toBe(false)
      expect(junior.delegateTo).toBeUndefined()
    })

    test('each role has required fields', () => {
      for (const [key, role] of Object.entries(DEFAULT_ROLES)) {
        expect(role.type).toBe(key as ModelRoleType)
        expect(role.displayName).toBeDefined()
        expect(role.displayName.length).toBeGreaterThan(0)
        expect(role.description).toBeDefined()
        expect(role.requiredCapability).toBeDefined()
        expect(role.responsibilities).toBeDefined()
        expect(role.responsibilities.length).toBeGreaterThan(0)
        expect(role.typicalTasks).toBeDefined()
        expect(role.typicalTasks.length).toBeGreaterThan(0)
        expect(typeof role.canDelegate).toBe('boolean')
      }
    })

    test('roles with canDelegate=true have delegateTo defined', () => {
      for (const role of Object.values(DEFAULT_ROLES)) {
        if (role.canDelegate) {
          expect(role.delegateTo).toBeDefined()
          expect(role.delegateTo!.length).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('TASK_CATEGORY_CAPABILITY_MAP', () => {
    test('maps all task categories', () => {
      const categories: TaskCategory[] = [
        'architecture',
        'implementation',
        'refactoring',
        'testing',
        'documentation',
        'debugging',
        'research',
        'maintenance',
        'security',
        'performance'
      ]

      for (const category of categories) {
        expect(TASK_CATEGORY_CAPABILITY_MAP[category]).toBeDefined()
      }
    })

    test('architecture requires high capability', () => {
      expect(TASK_CATEGORY_CAPABILITY_MAP.architecture).toBe('high')
    })

    test('implementation and refactoring require medium capability', () => {
      expect(TASK_CATEGORY_CAPABILITY_MAP.implementation).toBe('medium')
      expect(TASK_CATEGORY_CAPABILITY_MAP.refactoring).toBe('medium')
    })

    test('testing and documentation require low capability', () => {
      expect(TASK_CATEGORY_CAPABILITY_MAP.testing).toBe('low')
      expect(TASK_CATEGORY_CAPABILITY_MAP.documentation).toBe('low')
    })

    test('debugging, security, performance require high capability', () => {
      expect(TASK_CATEGORY_CAPABILITY_MAP.debugging).toBe('high')
      expect(TASK_CATEGORY_CAPABILITY_MAP.security).toBe('high')
      expect(TASK_CATEGORY_CAPABILITY_MAP.performance).toBe('high')
    })
  })

  describe('Role to Capability mapping consistency', () => {
    test('architect requires high capability', () => {
      expect(DEFAULT_ROLES.architect.requiredCapability).toBe('high')
    })

    test('junior-engineer requires low capability', () => {
      expect(DEFAULT_ROLES['junior-engineer'].requiredCapability).toBe('low')
    })

    test('engineer requires medium capability', () => {
      expect(DEFAULT_ROLES.engineer.requiredCapability).toBe('medium')
    })

    test('all role requiredCapabilities are valid ModelCapabilityLevels', () => {
      const validLevels: ModelCapabilityLevel[] = ['high', 'medium', 'low']

      for (const role of Object.values(DEFAULT_ROLES)) {
        expect(validLevels).toContain(role.requiredCapability)
      }
    })
  })
})
