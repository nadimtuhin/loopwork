/**
 * Generic Name Registry
 *
 * Like the medicine industry: brand names map to generic names.
 * - Brand name: "google/antigravity-gemini-3-flash" (custom/provider name)
 * - Generic name: "gemini-3-flash" (actual model)
 *
 * ALL mappings must be explicitly registered. No automatic pattern matching.
 */

export interface ResolvedName {
  /** Original brand name string */
  brand: string
  /** Provider prefix if present (google, anthropic, openai, etc.) */
  provider?: string
  /** The generic (actual) model name */
  generic: string
  /** Whether this was resolved via explicit registration */
  registered: boolean
}

export interface IGenericNameRegistry {
  /** Register a brand name → generic name mapping */
  register(brandName: string, genericName: string): void

  /** Register multiple brand → generic mappings at once */
  registerAll(mappings: Record<string, string>): void

  /** Resolve a brand name to its generic name */
  toGeneric(brandName: string): string

  /** Get full resolution details */
  resolve(brandName: string): ResolvedName

  /** Check if a brand name is registered */
  has(brandName: string): boolean

  /** Get all registered mappings */
  getMappings(): Map<string, string>
}

/**
 * Generic Name Registry
 *
 * Maps brand names to generic names, like the pharmaceutical industry:
 * - Tylenol (brand) → Acetaminophen (generic)
 * - google/antigravity-gemini-3-flash (brand) → gemini-3-flash (generic)
 *
 * ALL mappings must be explicitly registered. If a brand is not registered,
 * it returns the brand name as-is (after stripping provider prefix).
 *
 * @example
 * ```typescript
 * const registry = new GenericNameRegistry()
 *
 * // Register brand → generic mappings (REQUIRED)
 * registry.register('antigravity-gemini-3-flash', 'gemini-3-flash')
 * registry.register('my-custom-model', 'gpt-4o')
 *
 * // Resolve brand names to generic
 * registry.toGeneric('google/antigravity-gemini-3-flash') // → 'gemini-3-flash'
 * registry.toGeneric('unregistered-model')               // → 'unregistered-model' (as-is)
 * ```
 */
export class GenericNameRegistry implements IGenericNameRegistry {
  private brandToGeneric = new Map<string, string>()

  register(brandName: string, genericName: string): void {
    // Store the mapping (case-insensitive)
    this.brandToGeneric.set(brandName.toLowerCase(), genericName)

    // Also register the provider-stripped version
    const slashIndex = brandName.indexOf('/')
    if (slashIndex !== -1) {
      const withoutProvider = brandName.slice(slashIndex + 1).toLowerCase()
      if (!this.brandToGeneric.has(withoutProvider)) {
        this.brandToGeneric.set(withoutProvider, genericName)
      }
    }
  }

  registerAll(mappings: Record<string, string>): void {
    for (const [brand, generic] of Object.entries(mappings)) {
      this.register(brand, generic)
    }
  }

  getMappings(): Map<string, string> {
    return new Map(this.brandToGeneric)
  }

  has(brandName: string): boolean {
    const lower = brandName.toLowerCase()
    if (this.brandToGeneric.has(lower)) return true

    // Check without provider
    const slashIndex = brandName.indexOf('/')
    if (slashIndex !== -1) {
      const withoutProvider = brandName.slice(slashIndex + 1).toLowerCase()
      return this.brandToGeneric.has(withoutProvider)
    }
    return false
  }

  toGeneric(brandName: string): string {
    return this.resolve(brandName).generic
  }

  resolve(brandName: string): ResolvedName {
    const brand = brandName
    let remaining = brandName
    let provider: string | undefined

    // Step 1: Check for full string match first (including provider)
    const lowerBrand = brand.toLowerCase()
    if (this.brandToGeneric.has(lowerBrand)) {
      const slashIndex = brand.indexOf('/')
      if (slashIndex !== -1) {
        provider = brand.slice(0, slashIndex)
      }
      return {
        brand,
        provider,
        generic: this.brandToGeneric.get(lowerBrand)!,
        registered: true,
      }
    }

    // Step 2: Strip provider prefix (everything before first /)
    const slashIndex = remaining.indexOf('/')
    if (slashIndex !== -1) {
      provider = remaining.slice(0, slashIndex)
      remaining = remaining.slice(slashIndex + 1)
    }

    // Step 3: Check for match after stripping provider
    const lowerRemaining = remaining.toLowerCase()
    if (this.brandToGeneric.has(lowerRemaining)) {
      return {
        brand,
        provider,
        generic: this.brandToGeneric.get(lowerRemaining)!,
        registered: true,
      }
    }

    // Step 4: Not registered - return as-is (after provider strip)
    return {
      brand,
      provider,
      generic: remaining,
      registered: false,
    }
  }
}

// Singleton instance
let defaultRegistry: GenericNameRegistry | null = null

export function getGenericNameRegistry(): GenericNameRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new GenericNameRegistry()
  }
  return defaultRegistry
}

/**
 * Reset the singleton registry (for testing)
 */
export function resetGenericNameRegistry(): void {
  defaultRegistry = null
}

/**
 * Quick function to resolve a brand name to its generic name
 */
export function toGenericName(brandName: string): string {
  return getGenericNameRegistry().toGeneric(brandName)
}

/**
 * Get full resolution details for a brand name
 */
export function resolveBrandName(brandName: string): ResolvedName {
  return getGenericNameRegistry().resolve(brandName)
}

// ============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// ============================================================================

/** @deprecated Use GenericNameRegistry */
export const ModelResolver = GenericNameRegistry

/** @deprecated Use getGenericNameRegistry */
export const getModelResolver = getGenericNameRegistry

/** @deprecated Use resetGenericNameRegistry */
export const resetModelResolver = resetGenericNameRegistry

/** @deprecated Use toGenericName */
export const resolveModelName = toGenericName

/** @deprecated Use resolveBrandName */
export const parseModelName = resolveBrandName

/** @deprecated Use ResolvedName */
export type ParsedModelName = ResolvedName

/** @deprecated Use IGenericNameRegistry */
export type IModelResolver = IGenericNameRegistry
