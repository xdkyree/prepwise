import { z } from 'zod'
import type { Request, Response } from 'express'
import { callGemini, tryParseJsonText } from '../services/geminiService.js'
import { buildError } from '../middleware/error.js'
import {
  API_CONTRACT_VERSION,
  type DayPlanData,
  type ErrorResponse,
  type GeneratePlanResponse,
  type GrainCalcResponse,
  type GroceryItem,
  type MealData,
  type MealNutrition,
  type SwapMealResponse,
} from '../types/contracts.js'

type JsonRecord = Record<string, unknown>

const GROCERY_CATEGORIES = new Set(['Proteins', 'Produce', 'Grains', 'Dairy', 'Pantry', 'Other'])
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DIVERSITY_DIMENSIONS = ['protein', 'cuisine', 'method', 'carbBase'] as const

type DiversityDimension = (typeof DIVERSITY_DIMENSIONS)[number]

type MealDiversityDimensions = {
  protein: string
  cuisine: string
  method: string
  carbBase: string
}

type VarietyViolation = {
  day: (typeof WEEK_DAYS)[number]
  reasons: string[]
  lunch: string
  dinner: string
}

type MealSlotKey = 'breakfast' | 'lunch' | 'dinner'

type PlanPromptPayload = {
  macroConsideration?: {
    protein?: boolean
    calories?: boolean
    carbs?: boolean
    fat?: boolean
  }
  cookDays: string[]
  meals: string[]
  locale: string
  allergies?: string
  notes?: string
  scoopSize: number
  bulkItems?: string
}

function normalizeMacroConsideration(input: PlanPromptPayload['macroConsideration']) {
  return {
    protein: input?.protein ?? true,
    calories: input?.calories ?? true,
    carbs: input?.carbs ?? true,
    fat: input?.fat ?? true,
  }
}

function userTargetSummary(
  user: { name: string; protein: number; calories: number; carbs: number; fat: number; diet: string; carbBase: string },
  index: number,
  macroConsideration: ReturnType<typeof normalizeMacroConsideration>
): string {
  const parts: string[] = []
  if (macroConsideration.protein) parts.push(`${user.protein}g protein`)
  if (macroConsideration.calories) parts.push(`${user.calories}kcal`)
  if (macroConsideration.carbs) parts.push(`${user.carbs}g carbs`)
  if (macroConsideration.fat) parts.push(`${user.fat}g fat`)

  const macroText = parts.length > 0 ? parts.join(', ') : 'no macro constraints'
  return `User ${index + 1} (${user.name}): ${macroText}, ${user.diet}, carb base ${user.carbBase}`
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonRecord
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

function normalizeNutrition(value: unknown): MealNutrition | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  return {
    g: Math.max(0, asNumber(record.g, 0)),
    kcal: Math.max(0, asNumber(record.kcal, 0)),
  }
}

function buildLegacyPortionMap(mealRecord: JsonRecord): Map<number, MealNutrition> {
  const result = new Map<number, MealNutrition>()

  for (const [key, value] of Object.entries(mealRecord)) {
    const legacyMatch = /^p([A-Z])$/.exec(key)
    if (!legacyMatch) continue
    const nutrition = normalizeNutrition(value)
    if (!nutrition) continue
    const index = legacyMatch[1].charCodeAt(0) - 65
    if (index >= 0) {
      result.set(index, nutrition)
    }
  }

  return result
}

function normalizePortions(
  mealRecord: JsonRecord,
  users: Array<{ name: string }>,
  legacyByIndex: Map<number, MealNutrition>
): Array<{ user: string; g: number; kcal: number }> {
  const rawPortions = Array.isArray(mealRecord.portions) ? mealRecord.portions : []
  const mappedPortions = rawPortions
    .map((portion) => {
      const record = asRecord(portion)
      if (!record) return null
      const user = asString(record.user).trim()
      return {
        user,
        g: Math.max(0, asNumber(record.g, 0)),
        kcal: Math.max(0, asNumber(record.kcal, 0)),
      }
    })
    .filter((portion): portion is { user: string; g: number; kcal: number } => Boolean(portion))

  if (users.length === 0) {
    if (mappedPortions.length > 0) {
      return mappedPortions.map((portion, idx) => ({
        ...portion,
        user: portion.user || `User ${idx + 1}`,
      }))
    }
    return Array.from(legacyByIndex.entries()).map(([idx, values]) => ({
      user: `User ${idx + 1}`,
      g: values.g,
      kcal: values.kcal,
    }))
  }

  return users.map((user, index) => {
    const namedPortion = mappedPortions.find((portion) => portion.user === user.name)
    if (namedPortion) return { ...namedPortion, user: user.name }

    const indexedPortion = mappedPortions[index]
    if (indexedPortion) {
      return {
        user: user.name,
        g: indexedPortion.g,
        kcal: indexedPortion.kcal,
      }
    }

    const legacyPortion = legacyByIndex.get(index)
    if (legacyPortion) return { user: user.name, g: legacyPortion.g, kcal: legacyPortion.kcal }

    return { user: user.name, g: 0, kcal: 0 }
  })
}

function normalizeUserToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function resolveUserName(rawUser: string, users: Array<{ name: string }>): string {
  const token = normalizeUserToken(rawUser)
  if (!token) return rawUser

  const exact = users.find((user) => normalizeUserToken(user.name) === token)
  if (exact) return exact.name

  const withAliases = users.map((user, index) => ({
    name: user.name,
    aliases: [
      normalizeUserToken(user.name),
      normalizeUserToken(`user ${index + 1}`),
      normalizeUserToken(`member ${index + 1}`),
      normalizeUserToken(`person ${index + 1}`),
    ],
  }))

  const byAlias = withAliases.find((entry) => entry.aliases.some((alias) => alias.length > 0 && token.includes(alias)))
  if (byAlias) return byAlias.name

  const indexMatch = /\b(?:user|member|person)\s*(\d+)\b/.exec(token)
  if (indexMatch) {
    const idx = Number(indexMatch[1]) - 1
    if (idx >= 0 && idx < users.length) {
      return users[idx].name
    }
  }

  return rawUser
}

function normalizeSplitTable(
  splitTable: MealData['splitTable'],
  users: Array<{ name: string }>
): MealData['splitTable'] {
  if (!splitTable || splitTable.length === 0) return splitTable

  return splitTable
    .map((row) => {
      const ingredient = (row.ingredient || '').trim()
      if (!ingredient) return null

      const normalizedAllocations = row.allocations
        .map((allocation) => {
          const amount = (allocation.amount || '').trim()
          const resolvedUser = resolveUserName(allocation.user || '', users)
          if (!resolvedUser) return null
          return {
            user: resolvedUser,
            amount: amount || '-',
          }
        })
        .filter((allocation): allocation is { user: string; amount: string } => Boolean(allocation))

      const completedAllocations = users.map((user) => {
        const existing = normalizedAllocations.find((allocation) => allocation.user === user.name)
        return existing ?? { user: user.name, amount: '-' }
      })

      return {
        ingredient,
        allocations: completedAllocations,
      }
    })
    .filter((row): row is { ingredient: string; allocations: Array<{ user: string; amount: string }> } => Boolean(row))
}

function toMealData(value: unknown): MealData | undefined {
  const mealRecord = asRecord(value)
  if (!mealRecord) return undefined

  return {
    name: asString(mealRecord.name, ''),
    pan: asString(mealRecord.pan, ''),
    split: asString(mealRecord.split, ''),
    vol: asString(mealRecord.vol, ''),
    quickRecipe: asString(mealRecord.quickRecipe, ''),
    splitTable: Array.isArray(mealRecord.splitTable)
      ? mealRecord.splitTable
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
    portions: Array.isArray(mealRecord.portions)
      ? mealRecord.portions
          .map((portion) => {
            const record = asRecord(portion)
            if (!record) return null
            return {
              user: asString(record.user, ''),
              g: Math.max(0, asNumber(record.g, 0)),
              kcal: Math.max(0, asNumber(record.kcal, 0)),
            }
          })
          .filter((portion): portion is { user: string; g: number; kcal: number } => Boolean(portion))
      : undefined,
    pA: normalizeNutrition(mealRecord.pA),
    pB: normalizeNutrition(mealRecord.pB),
    isLeftover: typeof mealRecord.isLeftover === 'boolean' ? mealRecord.isLeftover : undefined,
  }
}

function normalizeMeal(meal: MealData | undefined, users: Array<{ name: string }>): MealData | undefined {
  const normalizedBase = toMealData(meal)
  if (!normalizedBase) return undefined
  const rawMealRecord = asRecord(meal) ?? {}

  const legacyByIndex = buildLegacyPortionMap(rawMealRecord)
  if (legacyByIndex.size === 0) {
    if (normalizedBase.pA) legacyByIndex.set(0, normalizedBase.pA)
    if (normalizedBase.pB) legacyByIndex.set(1, normalizedBase.pB)
  }

  const normalizedPortions = normalizePortions(normalizedBase as unknown as JsonRecord, users, legacyByIndex)
  const normalizedSplitTable = normalizeSplitTable(normalizedBase.splitTable, users)

  return {
    ...normalizedBase,
    portions: normalizedPortions,
    splitTable: normalizedSplitTable,
  }
}

function normalizeDay(day: unknown, users: Array<{ name: string }>): DayPlanData | null {
  const dayRecord = asRecord(day)
  if (!dayRecord) return null
  const cookDayRecord = asRecord(dayRecord.cd) ?? {}
  const leftoverDayRecord = asRecord(dayRecord.ld) ?? {}

  return {
    cd: {
      breakfast: normalizeMeal(toMealData(cookDayRecord.breakfast), users),
      lunch: normalizeMeal(toMealData(cookDayRecord.lunch), users),
      dinner: normalizeMeal(toMealData(cookDayRecord.dinner), users),
    },
    ld: {
      breakfast: normalizeMeal(toMealData(leftoverDayRecord.breakfast), users),
      lunch: normalizeMeal(toMealData(leftoverDayRecord.lunch), users),
      dinner: normalizeMeal(toMealData(leftoverDayRecord.dinner), users),
    },
  }
}

function normalizeWeekPlan(value: unknown, users: Array<{ name: string }>, cookDays: readonly string[]): Record<string, DayPlanData | null> {
  const weekRecord = asRecord(value) ?? {}

  return Object.fromEntries(
    WEEK_DAYS.map((day) => {
      if (!cookDays.includes(day)) return [day, null]
      return [day, normalizeDay(weekRecord[day], users)]
    })
  )
}

function normalizeGroceryList(value: unknown): GroceryItem[] {
  if (!Array.isArray(value)) return []

  return value.reduce<GroceryItem[]>((acc, entry) => {
      const record = asRecord(entry)
      if (!record) return acc
      const cat = asString(record.cat, 'Other')
      const normalized: GroceryItem = {
        item: asString(record.item, ''),
        local: asString(record.local, ''),
        qty: asString(record.qty, ''),
        cat: (GROCERY_CATEGORIES.has(cat) ? cat : 'Other') as GroceryItem['cat'],
      }

      if (typeof record.checked === 'boolean') {
        normalized.checked = record.checked
      }

      acc.push(normalized)
      return acc
    }, [])
}

function buildDefaultMeal(users: Array<{ name: string }>): MealData {
  return {
    name: 'Untitled meal',
    pan: '',
    split: '',
    vol: '',
    quickRecipe: '',
    splitTable: [],
    portions: users.map((user) => ({ user: user.name, g: 0, kcal: 0 })),
  }
}

function normalizeSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function extractByKeyword(text: string, keywordMap: Array<{ value: string; pattern: RegExp }>): string {
  const found = keywordMap.find((entry) => entry.pattern.test(text))
  return found ? found.value : ''
}

function deriveMealDiversityDimensions(meal: MealData | undefined): MealDiversityDimensions {
  const text = normalizeSignal([meal?.name || '', meal?.pan || '', meal?.split || '', meal?.vol || ''].join(' '))

  const protein = extractByKeyword(text, [
    { value: 'chicken', pattern: /\bchicken|thigh|drumstick\b/ },
    { value: 'beef', pattern: /\bbeef|steak|mince\b/ },
    { value: 'pork', pattern: /\bpork|ham|bacon\b/ },
    { value: 'turkey', pattern: /\bturkey\b/ },
    { value: 'fish', pattern: /\bsalmon|tuna|cod|mackerel|fish\b/ },
    { value: 'shrimp', pattern: /\bshrimp|prawn\b/ },
    { value: 'tofu', pattern: /\btofu\b/ },
    { value: 'tempeh', pattern: /\btempeh\b/ },
    { value: 'egg', pattern: /\begg|omelet|frittata\b/ },
    { value: 'lentils', pattern: /\blentil\b/ },
    { value: 'beans', pattern: /\bbeans?|chickpea\b/ },
  ])

  const cuisine = extractByKeyword(text, [
    { value: 'mediterranean', pattern: /\bmediterranean|greek|turkish\b/ },
    { value: 'mexican', pattern: /\bmexican|taco|burrito|fajita\b/ },
    { value: 'indian', pattern: /\bindian|curry|masala\b/ },
    { value: 'japanese', pattern: /\bjapanese|teriyaki|miso|udon\b/ },
    { value: 'thai', pattern: /\bthai|satay|lemongrass\b/ },
    { value: 'italian', pattern: /\bitalian|pasta|bolognese|risotto\b/ },
    { value: 'middle eastern', pattern: /\bmiddle eastern|shawarma|harissa\b/ },
    { value: 'american', pattern: /\bamerican|bbq|barbecue\b/ },
  ])

  const method = extractByKeyword(text, [
    { value: 'grilled', pattern: /\bgrill|grilled\b/ },
    { value: 'roasted', pattern: /\broast|roasted\b/ },
    { value: 'stir-fried', pattern: /\bstir fry|stir-fried|wok\b/ },
    { value: 'baked', pattern: /\bbake|baked\b/ },
    { value: 'stewed', pattern: /\bstew|braise|braised\b/ },
    { value: 'boiled', pattern: /\bboil|boiled|poached\b/ },
    { value: 'raw', pattern: /\braw|salad\b/ },
    { value: 'pan-seared', pattern: /\bsear|pan seared|saute\b/ },
  ])

  const carbBase = extractByKeyword(text, [
    { value: 'rice', pattern: /\brice\b/ },
    { value: 'quinoa', pattern: /\bquinoa\b/ },
    { value: 'millet', pattern: /\bmillet\b/ },
    { value: 'bulgur', pattern: /\bbulgur\b/ },
    { value: 'oats', pattern: /\boats?\b/ },
    { value: 'sweet potato', pattern: /\bsweet potato\b/ },
    { value: 'pasta', pattern: /\bpasta|noodle\b/ },
    { value: 'potato', pattern: /\bpotato\b/ },
    { value: 'bread', pattern: /\bbread|wrap|tortilla\b/ },
  ])

  return { protein, cuisine, method, carbBase }
}

function computeVarietyViolations(
  weekPlan: Record<string, DayPlanData | null>,
  cookDays: readonly string[],
  meals: readonly string[]
): VarietyViolation[] {
  if (!meals.includes('Lunch') || !meals.includes('Dinner')) {
    return []
  }

  const violations: VarietyViolation[] = []
  for (const day of WEEK_DAYS) {
    if (!cookDays.includes(day)) continue
    const dayPlan = weekPlan[day]
    if (!dayPlan) continue

    const lunch = dayPlan.cd?.lunch
    const dinner = dayPlan.cd?.dinner
    if (!lunch || !dinner) continue

    const lunchDims = deriveMealDiversityDimensions(lunch)
    const dinnerDims = deriveMealDiversityDimensions(dinner)
    const reasons: string[] = []

    if (lunchDims.protein && dinnerDims.protein && lunchDims.protein === dinnerDims.protein) {
      reasons.push(`Primary protein overlap: ${lunchDims.protein}`)
    }

    const differentDimensionCount = DIVERSITY_DIMENSIONS.reduce((count, dimension) => {
      const left = lunchDims[dimension]
      const right = dinnerDims[dimension]
      if (!left || !right) return count
      return left !== right ? count + 1 : count
    }, 0)

    if (differentDimensionCount < 2) {
      reasons.push(`Insufficient lunch/dinner diversity: ${differentDimensionCount}/2 required dimensions differ`)
    }

    if (reasons.length > 0) {
      violations.push({
        day,
        reasons,
        lunch: lunch.name || 'Untitled lunch',
        dinner: dinner.name || 'Untitled dinner',
      })
    }
  }

  return violations
}

function requestedMealSlots(meals: readonly string[]): MealSlotKey[] {
  const slots: MealSlotKey[] = []
  if (meals.includes('Breakfast')) slots.push('breakfast')
  if (meals.includes('Lunch')) slots.push('lunch')
  if (meals.includes('Dinner')) slots.push('dinner')
  return slots
}

function computeCompletenessViolations(
  weekPlan: Record<string, DayPlanData | null>,
  cookDays: readonly string[],
  meals: readonly string[]
): VarietyViolation[] {
  const requiredSlots = requestedMealSlots(meals)
  const violations: VarietyViolation[] = []

  for (const day of WEEK_DAYS) {
    if (!cookDays.includes(day)) continue
    const dayPlan = weekPlan[day]

    if (!dayPlan) {
      violations.push({
        day,
        reasons: ['Missing cook-day plan payload for this day'],
        lunch: 'Missing lunch',
        dinner: 'Missing dinner',
      })
      continue
    }

    const missingCookSlots = requiredSlots.filter((slot) => !dayPlan.cd?.[slot])
    const missingLeftoverSlots = requiredSlots.filter((slot) => !dayPlan.ld?.[slot])
    const reasons: string[] = []

    if (missingCookSlots.length > 0) {
      reasons.push(`Missing cook-day meals: ${missingCookSlots.join(', ')}`)
    }
    if (missingLeftoverSlots.length > 0) {
      reasons.push(`Missing leftover meals: ${missingLeftoverSlots.join(', ')}`)
    }

    if (reasons.length > 0) {
      violations.push({
        day,
        reasons,
        lunch: dayPlan.cd?.lunch?.name || 'Missing lunch',
        dinner: dayPlan.cd?.dinner?.name || 'Missing dinner',
      })
    }
  }

  return violations
}

function buildGeneratePlanPrompt(
  payload: PlanPromptPayload,
  userTargets: string,
  weekShape: Record<string, unknown>,
  previousViolations: VarietyViolation[]
): string {
  return [
    'Return strict JSON only.',
    'Build one weekly meal-prep plan for a household.',
    `Users: ${userTargets}`,
    `Cook days: ${payload.cookDays.join(', ')}`,
    `Meals: ${payload.meals.join(', ')}`,
    `Locale: ${payload.locale}`,
    `Allergies: ${payload.allergies || 'none'}`,
    `Notes: ${payload.notes || 'none'}`,
    `Scoop size: ${payload.scoopSize}ml`,
    `Bulk items on hand: ${payload.bulkItems || 'none'}`,
    'The split field must explicitly allocate portions per user, e.g. Chicken: 200g Alex, 100g Jordan.',
    'The splitTable field MUST be included as a table-like array of all ingredients used in the recipe.',
    'Every ingredient used in quickRecipe MUST appear once in splitTable.',
    'Each splitTable row must include ingredient and allocations per user with readable amounts.',
    'For splitTable.allocations.user, use the exact input user names only. Do not use aliases like User 1/A/B/Member 1.',
    'The quickRecipe field must be very rough and short: maximum 3 terse steps in plain text (no markdown), separated by semicolons.',
    'The portions array must contain one entry per user with exact user names and macro values.',
    'For every cook day, lunch and dinner MUST differ in at least 2 dimensions from this list: primary protein, cuisine, cooking method, carb base.',
    'For every cook day, lunch and dinner MUST NOT share the same primary protein.',
    'Use explicit wording in meal name/pan/split/vol so protein, cuisine, method, and carb base are inferable.',
    previousViolations.length > 0
      ? `Prior attempt failed diversity checks: ${previousViolations
          .map((violation) => `${violation.day} (${violation.lunch} vs ${violation.dinner}) -> ${violation.reasons.join('; ')}`)
          .join(' | ')}`
      : 'Diversity checks will be enforced post-generation; satisfy them in the first response.',
    'Return shape:',
    JSON.stringify({
      weekPlan: weekShape,
      groceryList: [{ item: '', local: '', qty: '', cat: 'Proteins' }],
    }),
  ].join('\n')
}

const userSchema = z.object({
  name: z.string().min(1),
  protein: z.number().nonnegative(),
  calories: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  carbBase: z.string().min(1),
  diet: z.string().min(1),
})

const generateSchema = z.object({
  users: z.array(userSchema).min(1),
  macroConsideration: z.object({
    protein: z.boolean(),
    calories: z.boolean(),
    carbs: z.boolean(),
    fat: z.boolean(),
  }).optional(),
  cookDays: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).min(1),
  meals: z.array(z.enum(['Breakfast', 'Lunch', 'Dinner'])).min(1),
  locale: z.enum(['Netherlands AH/Jumbo', 'UK Tesco', 'Lidl/Aldi EU', 'Generic English']),
  allergies: z.string().optional(),
  notes: z.string().optional(),
  scoopSize: z.number().min(50).max(1000),
  bulkItems: z.string().optional(),
})

const swapSchema = z.object({
  users: z.array(userSchema).min(1),
  macroConsideration: z.object({
    protein: z.boolean(),
    calories: z.boolean(),
    carbs: z.boolean(),
    fat: z.boolean(),
  }).optional(),
  day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  slot: z.enum(['cd', 'ld']),
  mealType: z.enum(['Breakfast', 'Lunch', 'Dinner']),
  allergies: z.string().optional(),
  scoopSize: z.number().min(50).max(1000),
})

const grainCalcSchema = z.object({
  grainInput: z.string().min(1),
  scoopSize: z.number().min(50).max(1000),
})

export async function generatePlan(
  req: Request,
  res: Response<GeneratePlanResponse | ErrorResponse>
): Promise<void> {
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) {
    const details = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])
    )
    res.status(400).json(buildError('VALIDATION_ERROR', 'Invalid request payload', details))
    return
  }

  const started = Date.now()
  const payload = parsed.data

  try {
    const macroConsideration = normalizeMacroConsideration(payload.macroConsideration)
    const userTargets = payload.users
      .map((u, idx) => userTargetSummary(u, idx, macroConsideration))
      .join(' | ')

    const mealTemplate = {
      breakfast: { name: '', pan: '', split: '', vol: '', quickRecipe: '', splitTable: [{ ingredient: '', allocations: [{ user: '', amount: '' }] }], portions: [{ user: '', g: 0, kcal: 0 }] },
      lunch: { name: '', pan: '', split: '', vol: '', quickRecipe: '', splitTable: [{ ingredient: '', allocations: [{ user: '', amount: '' }] }], portions: [{ user: '', g: 0, kcal: 0 }] },
      dinner: { name: '', pan: '', split: '', vol: '', quickRecipe: '', splitTable: [{ ingredient: '', allocations: [{ user: '', amount: '' }] }], portions: [{ user: '', g: 0, kcal: 0 }] },
    }

    const weekShape = Object.fromEntries(
      WEEK_DAYS.map((day) => [
        day,
        payload.cookDays.includes(day) ? { cd: mealTemplate, ld: mealTemplate } : null,
      ])
    )

    let attempt = 0
    let priorViolations: VarietyViolation[] = []
    let normalizedWeekPlan: Record<string, DayPlanData | null> = normalizeWeekPlan(undefined, payload.users, payload.cookDays)
    let normalizedGroceryList: GroceryItem[] = []
    let finalViolations: VarietyViolation[] = []

    while (attempt < 2) {
      attempt += 1
      const prompt = buildGeneratePlanPrompt(payload, userTargets, weekShape, priorViolations)
      const raw = await callGemini(prompt)
      const data = tryParseJsonText<unknown>(raw)
      const dataRecord = asRecord(data) ?? {}

      normalizedWeekPlan = normalizeWeekPlan(dataRecord.weekPlan, payload.users, payload.cookDays)
      normalizedGroceryList = normalizeGroceryList(dataRecord.groceryList)

      const completenessViolations = computeCompletenessViolations(normalizedWeekPlan, payload.cookDays, payload.meals)
      const diversityViolations = computeVarietyViolations(normalizedWeekPlan, payload.cookDays, payload.meals)
      finalViolations = [...completenessViolations, ...diversityViolations]
      if (finalViolations.length === 0) {
        break
      }

      priorViolations = finalViolations
    }

    const response: GeneratePlanResponse = {
      contractVersion: API_CONTRACT_VERSION,
      weekPlan: normalizedWeekPlan,
      groceryList: normalizedGroceryList,
      varietyDiagnostics: {
        passed: finalViolations.length === 0,
        attempts: attempt,
        violations: finalViolations,
      },
      timestamp: new Date().toISOString(),
      generationDurationMs: Date.now() - started,
    }

    res.status(200).json(response)
  } catch (err) {
    res.status(500).json(
      buildError('GEMINI_API_ERROR', (err as Error).message)
    )
  }
}

export async function swapMeal(
  req: Request,
  res: Response<SwapMealResponse | ErrorResponse>
): Promise<void> {
  const parsed = swapSchema.safeParse(req.body)
  if (!parsed.success) {
    const details = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])
    )
    res.status(400).json(buildError('VALIDATION_ERROR', 'Invalid request payload', details))
    return
  }

  try {
    const payload = parsed.data
    const macroConsideration = normalizeMacroConsideration(payload.macroConsideration)
    const users = payload.users
      .map((u, idx) => userTargetSummary(u, idx, macroConsideration))
      .join(' | ')

    const prompt = [
      'Return strict JSON only.',
      `Regenerate one meal: ${payload.day} ${payload.slot} ${payload.mealType}`,
      `Users: ${users}`,
      `Allergies: ${payload.allergies || 'none'}`,
      `Scoop size: ${payload.scoopSize}ml`,
      'Include quickRecipe with max 3 short steps separated by semicolons. Keep it rough and practical.',
      'Include splitTable with all ingredients used in the recipe and per-user amounts.',
      'Use exact input user names in splitTable.allocations.user; no aliases.',
      'Return shape:',
      JSON.stringify({
        name: '',
        pan: '',
        split: '',
        vol: '',
        quickRecipe: '',
        splitTable: [{ ingredient: '', allocations: [{ user: '', amount: '' }] }],
        portions: [{ user: '', g: 0, kcal: 0 }],
      }),
    ].join('\n')

    const raw = await callGemini(prompt)
    const parsedMeal = tryParseJsonText<unknown>(raw)
    const meal = normalizeMeal(toMealData(parsedMeal), payload.users)
    const response: SwapMealResponse = {
      ...(meal ?? buildDefaultMeal(payload.users)),
      contractVersion: API_CONTRACT_VERSION,
    }
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json(
      buildError('GEMINI_API_ERROR', (err as Error).message)
    )
  }
}

export async function grainCalc(
  req: Request,
  res: Response<GrainCalcResponse | ErrorResponse>
): Promise<void> {
  const parsed = grainCalcSchema.safeParse(req.body)
  if (!parsed.success) {
    const details = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])
    )
    res.status(400).json(buildError('VALIDATION_ERROR', 'Invalid request payload', details))
    return
  }

  try {
    const payload = parsed.data
    const prompt = [
      'Return strict JSON only.',
      `Calculate grain scoops for input: ${payload.grainInput}`,
      `Scoop size is ${payload.scoopSize}ml.`,
      'Return shape:',
      JSON.stringify({ scoops: '', tip: '' }),
    ].join('\n')

    const raw = await callGemini(prompt)
    const data = asRecord(tryParseJsonText<unknown>(raw)) ?? {}
    const response: GrainCalcResponse = {
      contractVersion: API_CONTRACT_VERSION,
      scoops: asString(data.scoops, '0 scoops'),
      tip: asString(data.tip, ''),
    }
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json(
      buildError('GEMINI_API_ERROR', (err as Error).message)
    )
  }
}
