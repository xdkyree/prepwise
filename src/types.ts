export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner'
export type CarbBase = 'Rice' | 'Quinoa' | 'Millet' | 'Bulgur' | 'Oats' | 'Sweet potato' | 'None'
export type DietType = 'No restriction' | 'Vegetarian' | 'Vegan' | 'Pescatarian' | 'Keto' | 'Paleo'
export type Locale = 'Netherlands AH/Jumbo' | 'UK Tesco' | 'Lidl/Aldi EU' | 'Generic English'
export type DayStatus = 'cook' | 'leftover' | 'rest'
export type GenerationStatus = 'idle' | 'generating' | 'done' | 'error'

export interface Profile {
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

export interface MealEntry {
  name: string
  pan: string
  split: string
  vol: string
  pA?: MealNutrition
  pB?: MealNutrition
  portions?: UserPortion[]
  isLeftover: boolean
}

export interface GroceryItem {
  item: string
  local: string
  qty: string
  cat: 'Proteins' | 'Produce' | 'Grains' | 'Dairy' | 'Pantry' | 'Other'
  checked?: boolean
}

export interface BulkAlloc {
  meal: string
  item: string
  amount: string
  tip: string
}

export interface WeekDayInfo {
  day: DayOfWeek
  status: DayStatus
  leftoverFrom?: DayOfWeek
}

// Spec-compatible aliases and new types
export type UserProfile = Profile
export type MacroBox = MealNutrition

export interface MealData {
  name: string
  pan: string
  split: string
  vol: string
  quickRecipe?: string
  splitTable?: IngredientSplitRow[]
  portions?: UserPortion[]
  pA?: MacroBox
  pB?: MacroBox
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
  [cookDay: string]: DayPlanData | null
}

export type BulkAllocation = BulkAlloc
