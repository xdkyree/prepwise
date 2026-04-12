import type {
  PicnicCheckoutRequest,
  PicnicCheckoutResponse,
  StoreIntegrationMode,
  StoreProviderId,
} from '../types/contracts.js'
import { checkoutWithPicnic } from './picnicService.js'

const SUPPORTED_PROVIDERS: StoreProviderId[] = ['picnic']
const ENABLED_PROVIDER_IDS = new Set<StoreProviderId>(
  (process.env.STORE_ENABLED_PROVIDERS || 'picnic')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is StoreProviderId => SUPPORTED_PROVIDERS.includes(value as StoreProviderId))
)

export function isStoreProviderEnabled(provider: StoreProviderId): boolean {
  return ENABLED_PROVIDER_IDS.has(provider)
}

export function defaultStoreProvider(): StoreProviderId {
  const firstEnabled = SUPPORTED_PROVIDERS.find((provider) => ENABLED_PROVIDER_IDS.has(provider))
  return firstEnabled || 'picnic'
}

export async function checkoutWithProvider(payload: PicnicCheckoutRequest): Promise<{
  provider: StoreProviderId
  integrationMode: StoreIntegrationMode
  cartUpdated: PicnicCheckoutResponse['cartUpdated']
}> {
  const provider = payload.provider || defaultStoreProvider()

  if (!isStoreProviderEnabled(provider)) {
    throw new Error(`Store provider disabled: ${provider}`)
  }

  if (provider === 'picnic') {
    const picnic = await checkoutWithPicnic(payload)
    return {
      provider,
      integrationMode: picnic.integrationMode,
      cartUpdated: picnic.cartUpdated,
    }
  }

  throw new Error(`Unsupported provider: ${provider}`)
}
