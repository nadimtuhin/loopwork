import {
  type ModelCapabilityRegistry,
  type ModelCapability,
  type ModelRole,
  type ModelCapabilityLevel,
  type ModelRoleType,
  type TaskCategory,
  DEFAULT_CAPABILITIES,
  DEFAULT_ROLES,
  TASK_CATEGORY_CAPABILITY_MAP
} from '../contracts/model-capability'

export class ModelCapabilityRegistryImpl implements ModelCapabilityRegistry {
  private capabilities = new Map<ModelCapabilityLevel, ModelCapability>()
  private roles = new Map<ModelRoleType, ModelRole>()
  private taskCategoryMap = new Map<TaskCategory, ModelCapabilityLevel>()

  constructor() {
    this.initializeDefaults()
  }

  private initializeDefaults(): void {
    Object.values(DEFAULT_CAPABILITIES).forEach(cap => {
      this.registerCapability(cap)
    })

    Object.values(DEFAULT_ROLES).forEach(role => {
      this.registerRole(role)
    })

    Object.entries(TASK_CATEGORY_CAPABILITY_MAP).forEach(([category, level]) => {
      this.taskCategoryMap.set(category as TaskCategory, level)
    })
  }

  registerCapability(capability: ModelCapability): void {
    this.capabilities.set(capability.level, capability)
  }

  registerRole(role: ModelRole): void {
    this.roles.set(role.type, role)
  }

  getCapability(level: ModelCapabilityLevel): ModelCapability | undefined {
    return this.capabilities.get(level)
  }

  getRole(type: ModelRoleType): ModelRole | undefined {
    return this.roles.get(type)
  }

  getAllCapabilities(): ModelCapability[] {
    return Array.from(this.capabilities.values())
  }

  getAllRoles(): ModelRole[] {
    return Array.from(this.roles.values())
  }

  findRolesForCapability(level: ModelCapabilityLevel): ModelRole[] {
    const capability = this.getCapability(level)
    if (!capability) return []

    const capValue = this.getCapabilityValue(level)
    
    return this.getAllRoles().filter(role => {
      const roleReqValue = this.getCapabilityValue(role.requiredCapability)
      return capValue >= roleReqValue
    })
  }

  findCapabilitiesForTask(category: TaskCategory): ModelCapability[] {
    const requiredLevel = this.taskCategoryMap.get(category)
    if (requiredLevel) {
      const cap = this.getCapability(requiredLevel)
      if (cap) {
        const reqValue = this.getCapabilityValue(requiredLevel)
        return this.getAllCapabilities().filter(c => 
          this.getCapabilityValue(c.level) >= reqValue
        )
      }
    }

    return this.getAllCapabilities().filter(cap => 
      cap.suitableTasks.includes(category)
    )
  }

  canHandleComplexity(level: ModelCapabilityLevel, complexity: number): boolean {
    const capability = this.getCapability(level)
    if (!capability) return false
    return complexity <= capability.maxComplexity
  }

  private getCapabilityValue(level: ModelCapabilityLevel): number {
    switch (level) {
      case 'high': return 3
      case 'medium': return 2
      case 'low': return 1
      default: return 0
    }
  }
}

export function createModelCapabilityRegistry(): ModelCapabilityRegistry {
  return new ModelCapabilityRegistryImpl()
}
