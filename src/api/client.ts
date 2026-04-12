import type {
  MealData,
  UserProfile,
  WeekPlan,
  BulkAllocation,
} from '../types'
import type {
  ErrorResponse,
  GeneratePlanRequest,
  GeneratePlanResponse,
  GrainCalcRequest,
  GrainCalcResponse,
  PicnicCheckoutRequest,
  PicnicCheckoutResponse,
  SwapMealRequest,
  SwapMealResponse,
} from '../../backend/src/types/contracts'

const API_BASE = '/api'
const EXPECTED_CONTRACT_VERSION = '2026-04-03' as const
const GROCERY_CATEGORIES = new Set(['Proteins', 'Produce', 'Grains', 'Dairy', 'Pantry', 'Other'])
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function assertContractVersion(value: unknown): asserts value is typeof EXPECTED_CONTRACT_VERSION {
  if (value !== EXPECTED_CONTRACT_VERSION) {
    throw new Error('Server response contract mismatch. Refresh and try again.')
  }
}

function sanitizeMeal(value: unknown): MealData {
  const record = asRecord(value) ?? {}
  const rawPortions = Array.isArray(record.portions) ? record.portions : []

  return {
    name: asString(record.name, 'Untitled meal'),
    pan: asString(record.pan, ''),
    split: asString(record.split, ''),
    vol: asString(record.vol, ''),
    quickRecipe: asString(record.quickRecipe, ''),
    splitTable: Array.isArray(record.splitTable)
      ? record.splitTable
          .map((row) => {
            const parsedRow = asRecord(row)
            if (!parsedRow) return null
            const allocations = Array.isArray(parsedRow.allocations)
              ? parsedRow.allocations
                  .map((allocation) => {
                    const parsedAllocation = asRecord(allocation)
                    if (!parsedAllocation) return null
                    return {
                      user: asString(parsedAllocation.user, ''),
                      amount: asString(parsedAllocation.amount, ''),
                    }
                  })
                  .filter((allocation): allocation is { user: string; amount: string } => Boolean(allocation))
              : []

            return {
              ingredient: asString(parsedRow.ingredient, ''),
              allocations,
            }
          })
          .filter((row): row is { ingredient: string; allocations: Array<{ user: string; amount: string }> } => Boolean(row))
      : undefined,
    portions: rawPortions
      .map((portion) => {
        const parsed = asRecord(portion)
        if (!parsed) return null
        return {
          user: asString(parsed.user, ''),
          g: Math.max(0, asNumber(parsed.g, 0)),
          kcal: Math.max(0, asNumber(parsed.kcal, 0)),
        }
      })
      .filter((portion): portion is { user: string; g: number; kcal: number } => Boolean(portion)),
    pA: (() => {
      const pA = asRecord(record.pA)
      if (!pA) return undefined
      return { g: Math.max(0, asNumber(pA.g, 0)), kcal: Math.max(0, asNumber(pA.kcal, 0)) }
    })(),
    pB: (() => {
      const pB = asRecord(record.pB)
      if (!pB) return undefined
      return { g: Math.max(0, asNumber(pB.g, 0)), kcal: Math.max(0, asNumber(pB.kcal, 0)) }
    })(),
    isLeftover: typeof record.isLeftover === 'boolean' ? record.isLeftover : undefined,
  }
}

function sanitizeWeekPlan(value: unknown): WeekPlan {
  const weekRecord = asRecord(value) ?? {}
  const week: WeekPlan = {}

  DAY_ORDER.forEach((day) => {
    const dayValue = weekRecord[day]
    if (dayValue === null) {
      week[day] = null
      return
    }

    const dayRecord = asRecord(dayValue)
    if (!dayRecord) {
      week[day] = null
      return
    }

    const legacyRootMeals = {
      breakfast: dayRecord.breakfast,
      lunch: dayRecord.lunch,
      dinner: dayRecord.dinner,
    }
    const hasLegacyRootMeals = Object.values(legacyRootMeals).some(Boolean)

    const cd = asRecord(dayRecord.cd) ?? (hasLegacyRootMeals ? legacyRootMeals : {})
    const ld = asRecord(dayRecord.ld) ?? (hasLegacyRootMeals ? legacyRootMeals : {})

    week[day] = {
      cd: {
        breakfast: cd.breakfast ? sanitizeMeal(cd.breakfast) : undefined,
        lunch: cd.lunch ? sanitizeMeal(cd.lunch) : undefined,
        dinner: cd.dinner ? sanitizeMeal(cd.dinner) : undefined,
      },
      ld: {
        breakfast: ld.breakfast ? sanitizeMeal(ld.breakfast) : undefined,
        lunch: ld.lunch ? sanitizeMeal(ld.lunch) : undefined,
        dinner: ld.dinner ? sanitizeMeal(ld.dinner) : undefined,
      },
    }
  })

  return week
}

function sanitizeGroceryList(value: unknown): GeneratePlanResponse['groceryList'] {
  if (!Array.isArray(value)) return []

  return value.reduce<GeneratePlanResponse['groceryList']>((acc, item) => {
      const parsed = asRecord(item)
      if (!parsed) return acc
      const category = asString(parsed.cat, 'Other')
      const normalized: GeneratePlanResponse['groceryList'][number] = {
        item: asString(parsed.item, ''),
        local: asString(parsed.local, ''),
        qty: asString(parsed.qty, '1'),
        cat: (GROCERY_CATEGORIES.has(category) ? category : 'Other') as GeneratePlanResponse['groceryList'][number]['cat'],
      }
      if (typeof parsed.checked === 'boolean') {
        normalized.checked = parsed.checked
      }
      acc.push(normalized)
      return acc
    }, [])
}

function parseGeneratePlanResponse(value: unknown): GeneratePlanResult {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Server returned malformed plan data.')
  }

  assertContractVersion(record.contractVersion)

  return {
    contractVersion: EXPECTED_CONTRACT_VERSION,
    weekPlan: sanitizeWeekPlan(record.weekPlan),
    groceryList: sanitizeGroceryList(record.groceryList),
    varietyDiagnostics: (() => {
      const diagnostics = asRecord(record.varietyDiagnostics)
      if (!diagnostics) return undefined
      const rawViolations = Array.isArray(diagnostics.violations) ? diagnostics.violations : []
      const violations = rawViolations.reduce<NonNullable<GeneratePlanResponse['varietyDiagnostics']>['violations']>((acc, violation) => {
        const parsed = asRecord(violation)
        if (!parsed) return acc
        const day = asString(parsed.day, '')
        if (!day) return acc
        const reasons = Array.isArray(parsed.reasons)
          ? parsed.reasons.filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
          : []
        acc.push({
          day: day as NonNullable<GeneratePlanResponse['varietyDiagnostics']>['violations'][number]['day'],
          reasons,
          lunch: asString(parsed.lunch, ''),
          dinner: asString(parsed.dinner, ''),
        })
        return acc
      }, [])

      return {
        passed: typeof diagnostics.passed === 'boolean' ? diagnostics.passed : false,
        attempts: Math.max(1, asNumber(diagnostics.attempts, 1)),
        violations,
      }
    })(),
    timestamp: asString(record.timestamp, new Date().toISOString()),
    generationDurationMs: Math.max(0, asNumber(record.generationDurationMs, 0)),
  }
}

function parseSwapMealResponse(value: unknown): SwapMealResult {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Server returned malformed swap data.')
  }

  assertContractVersion(record.contractVersion)

  return {
    ...sanitizeMeal(record),
    contractVersion: EXPECTED_CONTRACT_VERSION,
  }
}

function parseGrainCalcResponse(value: unknown): GrainCalcResponse {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Server returned malformed grain calculator data.')
  }

  assertContractVersion(record.contractVersion)

  return {
    contractVersion: EXPECTED_CONTRACT_VERSION,
    scoops: asString(record.scoops, '0 scoops'),
    tip: asString(record.tip, ''),
  }
}

function parsePicnicCheckoutResponse(value: unknown): PicnicCheckoutResponse {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Server returned malformed checkout data.')
  }

  assertContractVersion(record.contractVersion)

  const cartUpdated = Array.isArray(record.cartUpdated)
    ? record.cartUpdated.reduce<PicnicCheckoutResponse['cartUpdated']>((acc, entry) => {
          const parsed = asRecord(entry)
          if (!parsed) return acc
          const status = asString(parsed.status, 'error')
          const normalizedStatus: 'added' | 'not_found' | 'error' =
            status === 'added' || status === 'not_found' || status === 'error' ? status : 'error'

          const normalized: PicnicCheckoutResponse['cartUpdated'][number] = {
            query: asString(parsed.query, ''),
            status: normalizedStatus,
          }
          if (typeof parsed.detail === 'string' && parsed.detail.length > 0) {
            normalized.detail = parsed.detail
          }

          acc.push(normalized)
          return acc
        }, [])
    : []

  const normalizeProvider = (input: unknown): PicnicCheckoutResponse['provider'] => {
    return input === 'picnic' ? 'picnic' : 'picnic'
  }

  const normalizeIntegrationMode = (input: unknown): PicnicCheckoutResponse['integrationMode'] => {
    return input === 'live' || input === 'simulated' ? input : 'simulated'
  }

  return {
    contractVersion: EXPECTED_CONTRACT_VERSION,
    success: typeof record.success === 'boolean' ? record.success : cartUpdated.length > 0 && cartUpdated.every((item) => item.status === 'added'),
    provider: normalizeProvider(record.provider),
    integrationMode: normalizeIntegrationMode(record.integrationMode),
    cartUpdated,
    timestamp: asString(record.timestamp, new Date().toISOString()),
  }
}

const friendlyErrors: Record<string, string> = {
  VALIDATION_ERROR: 'Some inputs are invalid. Review your setup and try again.',
  GEMINI_API_ERROR: 'Meal plan generation failed. Please try again in a moment.',
  PICNIC_API_ERROR: 'Picnic sync failed. Please retry shortly.',
}

async function request(path: string, payload: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let message = `Request failed with ${res.status}`
    try {
      const err = (await res.json()) as ErrorResponse
      message = friendlyErrors[err.error] || err.message || message
    } catch {
      // keep fallback message
    }
    throw new Error(message)
  }

  try {
    return await res.json()
  } catch {
    throw new Error('Server returned invalid JSON.')
  }
}

export type GeneratePlanPayload = GeneratePlanRequest

export interface GeneratePlanResult {
  weekPlan: WeekPlan
  groceryList: GeneratePlanResponse['groceryList']
  varietyDiagnostics?: GeneratePlanResponse['varietyDiagnostics']
  timestamp: string
  generationDurationMs: number
  contractVersion: GeneratePlanResponse['contractVersion']
}

export function generatePlan(payload: GeneratePlanPayload) {
  return request('/generate-plan', payload).then(parseGeneratePlanResponse)
}

export type SwapMealPayload = SwapMealRequest

export type SwapMealResult = MealData & { contractVersion: SwapMealResponse['contractVersion'] }

export function swapMeal(payload: SwapMealPayload) {
  return request('/swap-meal', payload).then(parseSwapMealResponse)
}

export type GrainCalcPayload = GrainCalcRequest

export function grainCalc(payload: GrainCalcPayload) {
  return request('/grain-calc', payload).then(parseGrainCalcResponse)
}

export type PicnicCheckoutPayload = PicnicCheckoutRequest

export function picnicCheckout(payload: PicnicCheckoutPayload) {
  return request('/picnic-checkout', payload).then(parsePicnicCheckoutResponse)
}

export interface BulkAllocPayload {
  users: UserProfile[]
  bulkItems: string
  weekPlan: WeekPlan
}

// Frontend-only helper for now until a backend endpoint is added.
export async function allocateBulkLocally(payload: BulkAllocPayload): Promise<BulkAllocation[]> {
  const mealNames: string[] = []

  Object.values(payload.weekPlan).forEach((dayData) => {
    if (!dayData) return
    ;(['cd', 'ld'] as const).forEach((slot) => {
      ;(['breakfast', 'lunch', 'dinner'] as const).forEach((m) => {
        const meal = dayData[slot][m]
        if (meal) mealNames.push(meal.name)
      })
    })
  })

  return mealNames.slice(0, 6).map((name) => ({
    meal: name,
    item: payload.bulkItems,
    amount: 'Adjust to taste',
    tip: `Distribute ${payload.bulkItems} across prep sessions`,
  }))
}
