import type {
  CapabilityBasedModelSelector,
  CapabilityCriteria,
  CapabilityMatchResult,
  CapabilityModelConfig,
  ModelCapabilityRegistry,
  ModelCapabilityLevel,
  ModelRoleType,
  TaskCategory
} from '../contracts/model-capability'
import { createModelCapabilityRegistry } from './model-capability-registry'

export class CapabilityBasedModelSelectorImpl implements CapabilityBasedModelSelector {
  private models: CapabilityModelConfig[] = []
  private registry: ModelCapabilityRegistry

  constructor(registry?: ModelCapabilityRegistry) {
    this.registry = registry || createModelCapabilityRegistry()
  }

  registerModel(model: CapabilityModelConfig): void {
    this.models.push(model)
  }

  getAllModels(): CapabilityModelConfig[] {
    return [...this.models]
  }

  getModelsByCapability(level: ModelCapabilityLevel): CapabilityModelConfig[] {
    return this.models.filter(m => m.capability === level)
  }

  getModelsByRole(role: ModelRoleType): CapabilityModelConfig[] {
    return this.models.filter(m => 
      m.primaryRole === role || 
      (m.secondaryRoles && m.secondaryRoles.includes(role))
    )
  }

  reset(): void {
  }

  getNextByCapability(criteria: CapabilityCriteria): CapabilityMatchResult {
    let candidates = [...this.models]
    const reasons: string[] = []

    candidates = candidates.filter(m => m.enabled !== false)

    if (criteria.minCapability) {
      const minVal = this.getCapabilityValue(criteria.minCapability)
      candidates = candidates.filter(m => {
        const mVal = this.getCapabilityValue(m.capability)
        return mVal >= minVal
      })
      reasons.push(`Filtered by min capability: ${criteria.minCapability}`)
    }

    if (criteria.preferredCapability) {
    }

    if (criteria.requiredRole) {
      const role = criteria.requiredRole
      candidates = candidates.filter(m => 
        m.primaryRole === role || 
        (m.secondaryRoles && m.secondaryRoles.includes(role))
      )
      reasons.push(`Filtered by required role: ${role}`)
    }

    if (criteria.taskCategory) {
      candidates = candidates.filter(m => {
        if (m.optimizedFor && m.optimizedFor.includes(criteria.taskCategory!)) return true
        
        const caps = this.registry.findCapabilitiesForTask(criteria.taskCategory!)
        return caps.some(c => c.level === m.capability)
      })
      reasons.push(`Filtered by task category: ${criteria.taskCategory}`)
    }

    if (criteria.taskComplexity) {
      candidates = candidates.filter(m => {
        const maxC = m.maxComplexity ?? this.registry.getCapability(m.capability)?.maxComplexity ?? 0
        return maxC >= criteria.taskComplexity!
      })
      reasons.push(`Filtered by complexity: ${criteria.taskComplexity}`)
    }

    if (criteria.maxCostWeight) {
      candidates = candidates.filter(m => {
        const cost = m.costWeight ?? this.registry.getCapability(m.capability)?.costWeight ?? 100
        return cost <= criteria.maxCostWeight!
      })
      reasons.push(`Filtered by max cost weight: ${criteria.maxCostWeight}`)
    }

    if (candidates.length === 0) {
      return {
        matched: false,
        matchReasons: reasons,
        alternatives: [] 
      }
    }

    candidates.sort((a, b) => {
      if (criteria.preferredCapability) {
        const aMatch = a.capability === criteria.preferredCapability || a.extendedCapability === criteria.preferredCapability
        const bMatch = b.capability === criteria.preferredCapability || b.extendedCapability === criteria.preferredCapability
        if (aMatch && !bMatch) return -1
        if (!aMatch && bMatch) return 1
      }

      if (criteria.preferLowerCost !== false) {
        const aCost = a.costWeight ?? this.registry.getCapability(a.capability)?.costWeight ?? 0
        const bCost = b.costWeight ?? this.registry.getCapability(b.capability)?.costWeight ?? 0
        if (aCost !== bCost) return aCost - bCost
      }

      const aVal = this.getCapabilityValue(a.capability)
      const bVal = this.getCapabilityValue(b.capability)
      return bVal - aVal
    })

    const selected = candidates[0]
    
    return {
      matched: true,
      model: selected,
      matchedCapability: selected.capability,
      score: 100, // Placeholder score
      matchReasons: reasons,
      alternatives: candidates.slice(1)
    }
  }

  getNextByRole(roleType: ModelRoleType): CapabilityMatchResult {
    return this.getNextByCapability({ requiredRole: roleType })
  }

  getNextForTaskCategory(category: TaskCategory): CapabilityMatchResult {
    return this.getNextByCapability({ taskCategory: category })
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

export function createCapabilityModelSelector(registry?: ModelCapabilityRegistry): CapabilityBasedModelSelector {
  return new CapabilityBasedModelSelectorImpl(registry)
}
