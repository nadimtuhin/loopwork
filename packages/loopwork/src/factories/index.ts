import { ProviderManager } from '../implementations/provider-manager'

export function createProviderManager(): ProviderManager {
  return new ProviderManager()
}
