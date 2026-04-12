import { z } from 'zod'
import type { Request, Response } from 'express'
import {
  checkoutWithProvider,
  defaultStoreProvider,
  isStoreProviderEnabled,
} from '../services/storeProviderService.js'
import { buildError } from '../middleware/error.js'
import {
  API_CONTRACT_VERSION,
  type ErrorResponse,
  type PicnicCheckoutRequest,
  type PicnicCheckoutResponse,
  type StoreProviderId,
} from '../types/contracts.js'

const checkoutSchema = z.object({
  provider: z.enum(['picnic']).optional(),
  auth: z.object({
    email: z.string().email().optional(),
    password: z.string().min(1).optional(),
    authToken: z.string().min(1).optional(),
    sessionCookie: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
  }).optional(),
  products: z.array(
    z.object({
      query: z.string().min(1),
      quantity: z.number().int().min(1),
    })
  ).min(1),
}).superRefine((value, ctx) => {
  const provider = (value.provider || defaultStoreProvider()) as StoreProviderId
  if (!isStoreProviderEnabled(provider)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provider'],
      message: `Provider '${provider}' is disabled`,
    })
  }
})

export async function picnicCheckout(
  req: Request<unknown, PicnicCheckoutResponse | ErrorResponse, PicnicCheckoutRequest>,
  res: Response<PicnicCheckoutResponse | ErrorResponse>
): Promise<void> {
  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const details = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])
    )
    res.status(400).json(buildError('VALIDATION_ERROR', 'Invalid request payload', details))
    return
  }

  try {
    const providerPayload: PicnicCheckoutRequest = {
      ...parsed.data,
      provider: parsed.data.provider || defaultStoreProvider(),
    }
    const checkout = await checkoutWithProvider(providerPayload)
    const cartUpdated = checkout.cartUpdated
    const success = cartUpdated.every((item) => item.status === 'added')
    const response: PicnicCheckoutResponse = {
      contractVersion: API_CONTRACT_VERSION,
      success,
      provider: checkout.provider,
      integrationMode: checkout.integrationMode,
      cartUpdated,
      timestamp: new Date().toISOString(),
    }
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json(
      buildError('PICNIC_API_ERROR', (err as Error).message)
    )
  }
}
