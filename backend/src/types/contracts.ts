export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner'
export type CarbBase = 'Rice' | 'Quinoa' | 'Millet' | 'Bulgur' | 'Oats' | 'Sweet potato' | 'None'
export type DietType = 'No restriction' | 'Vegetarian' | 'Vegan' | 'Pescatarian' | 'Keto' | 'Paleo'
export type Locale = 'Netherlands AH/Jumbo' | 'UK Tesco' | 'Lidl/Aldi EU' | 'Generic English'
export type StoreProviderId = 'picnic'
export type StoreIntegrationMode = 'live' | 'simulated'

export const API_CONTRACT_VERSION = '2026-04-03' as const
export type ApiContractVersion = typeof API_CONTRACT_VERSION

export interface ContractVersioned {
  contractVersion: ApiContractVersion
}

export interface UserProfile {
  name: string
  protein: number
  calories: number
  carbs: number
  fat: number
  carbBase: CarbBase
  diet: DietType
}

export interface MacroConsideration {
  protein: boolean
  calories: boolean
  carbs: boolean
  fat: boolean
}

export interface MealNutrition {
  g: number
  kcal: number
}

export interface UserPortion {
  user: string
  g: number
  kcal: number
}

export interface IngredientSplitAllocation {
  user: string
  amount: string
}

export interface IngredientSplitRow {
  ingredient: string
  allocations: IngredientSplitAllocation[]
}

export interface MealData {
  name: string
  pan: string
  split: string
  vol: string
  quickRecipe?: string
  splitTable?: IngredientSplitRow[]
  portions?: UserPortion[]
  pA?: MealNutrition
  pB?: MealNutrition
  isLeftover?: boolean
}

export interface DayPlanData {
  cd: {
    breakfast?: MealData
    lunch?: MealData
    dinner?: MealData
  }
  ld: {
    breakfast?: MealData
    lunch?: MealData
    dinner?: MealData
  }
}

export interface WeekPlan {
  [day: string]: DayPlanData | null
}

export interface GroceryItem {
  item: string
  local: string
  qty: string
  cat: 'Proteins' | 'Produce' | 'Grains' | 'Dairy' | 'Pantry' | 'Other'
  checked?: boolean
}

export interface BulkAllocation {
  meal: string
  item: string
  amount: string
  tip: string
}

export interface GeneratePlanRequest {
  users: UserProfile[]
  macroConsideration?: MacroConsideration
  cookDays: DayOfWeek[]
  meals: MealType[]
  locale: Locale
  allergies?: string
  notes?: string
  scoopSize: number
  bulkItems?: string
}

export interface GeneratePlanResponse extends ContractVersioned {
  weekPlan: WeekPlan
  groceryList: GroceryItem[]
  varietyDiagnostics?: {
    passed: boolean
    attempts: number
    violations: Array<{
      day: DayOfWeek
      reasons: string[]
      lunch: string
      dinner: string
    }>
  }
  timestamp: string
  generationDurationMs: number
}

export interface SwapMealRequest {
  users: UserProfile[]
  macroConsideration?: MacroConsideration
  day: DayOfWeek
  slot: 'cd' | 'ld'
  mealType: MealType
  allergies?: string
  scoopSize: number
}

export type SwapMealResponse = MealData & ContractVersioned

export interface GrainCalcRequest {
  grainInput: string
  scoopSize: number
}

export interface GrainCalcResponse extends ContractVersioned {
  scoops: string
  tip: string
}

export interface PicnicCheckoutRequest {
  provider?: StoreProviderId
  auth?: {
    email?: string
    password?: string
    authToken?: string
    sessionCookie?: string
    userId?: string
    apiKey?: string
  }
  products: Array<{
    query: string
    quantity: number
  }>
}

export interface PicnicCheckoutResult {
  query: string
  status: 'added' | 'not_found' | 'error'
  detail?: string
}

export interface PicnicCheckoutResponse extends ContractVersioned {
  success: boolean
  provider: StoreProviderId
  integrationMode: StoreIntegrationMode
  cartUpdated: PicnicCheckoutResult[]
  timestamp: string
}

export interface ErrorResponse {
  error: string
  message: string
  details?: Record<string, string>
  timestamp: string
}
