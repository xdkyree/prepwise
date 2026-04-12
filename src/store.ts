import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  allocateBulkLocally,
  generatePlan as generatePlanApi,
  picnicCheckout,
  swapMeal as swapMealApi,
} from './api/client'
import type {
  DayOfWeek,
  MealType,
  DietType,
  Locale,
  MacroConsideration,
  UserProfile,
  MealData,
  DayPlanData,
  WeekPlan,
  GroceryItem,
  BulkAllocation,
  DayStatus,
  WeekDayInfo,
} from './types'

const DAY_ORDER: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function buildWeekInfo(cookDays: DayOfWeek[]): WeekDayInfo[] {
  const statusMap: Record<DayOfWeek, DayStatus> = {
    Mon: 'rest', Tue: 'rest', Wed: 'rest', Thu: 'rest',
    Fri: 'rest', Sat: 'rest', Sun: 'rest',
  }
  const leftoverFromMap: Partial<Record<DayOfWeek, DayOfWeek>> = {}

  cookDays.forEach((day) => {
    statusMap[day] = 'cook'
    const idx = DAY_ORDER.indexOf(day)
    const nextDay = DAY_ORDER[(idx + 1) % 7]
    if (statusMap[nextDay] !== 'cook') {
      statusMap[nextDay] = 'leftover'
      leftoverFromMap[nextDay] = day
    }
  })

  return DAY_ORDER.map((day) => ({
    day,
    status: statusMap[day],
    leftoverFrom: leftoverFromMap[day],
  }))
}

const DEFAULT_USER_A: UserProfile = {
  name: 'Alex',
  protein: 180,
  calories: 2400,
  carbs: 250,
  fat: 70,
  carbBase: 'Rice',
  diet: 'No restriction',
}

const DEFAULT_USER_B: UserProfile = {
  name: 'Jordan',
  protein: 130,
  calories: 1900,
  carbs: 200,
  fat: 60,
  carbBase: 'Quinoa',
  diet: 'Vegetarian',
}

function createDefaultUser(index: number): UserProfile {
  const base = index % 2 === 0 ? DEFAULT_USER_A : DEFAULT_USER_B
  return {
    ...base,
    name: `Member ${index + 1}`,
  }
}

function applyGlobalDietFallback(users: UserProfile[], dietType: DietType): UserProfile[] {
  if (dietType === 'No restriction') return users

  let changed = false
  const mapped = users.map((user) => {
    if (user.diet !== 'No restriction') return user
    changed = true
    return { ...user, diet: dietType }
  })

  return changed ? mapped : users
}

function normalizeUsersForPayload(users: UserProfile[]): UserProfile[] {
  return users.map((user, index) => ({
    ...user,
    name: user.name.trim() || `Member ${index + 1}`,
    protein: Number.isFinite(user.protein) ? Math.max(0, user.protein) : 0,
    calories: Number.isFinite(user.calories) ? Math.max(0, user.calories) : 0,
    carbs: Number.isFinite(user.carbs) ? Math.max(0, user.carbs) : 0,
    fat: Number.isFinite(user.fat) ? Math.max(0, user.fat) : 0,
  }))
}

function parseCheckoutQuantity(value: string): number | undefined {
  const match = value.match(/^\s*(\d+)\s*([A-Za-z]+)?\s*$/)
  if (!match) return undefined
  const parsed = Number(match[1])
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

interface Store {
  // Persisted state
  users: UserProfile[]
  cookDays: DayOfWeek[]
  meals: MealType[]
  macroConsideration: MacroConsideration
  dietType: DietType
  locale: Locale
  allergies: string
  notes: string
  scoopSize: number
  bulkItems: string
  picnicCredentials: {
    email: string
    password: string
    authToken: string
    sessionCookie: string
    userId: string
    apiKey: string
  }

  // Session state
  weekPlan: WeekPlan
  groceryList: GroceryItem[]
  bulkAllocations: BulkAllocation[]
  activeTab: 'setup' | 'plan' | 'groceries'
  generationStatus: string
  isGenerating: boolean
  generationError: string | null
  generationNotice: string | null
  checkoutProvider: 'picnic'
  checkoutIntegrationMode: 'live' | 'simulated' | null
  loadingDays: DayOfWeek[]
  lastFailedAction: 'generate' | 'swap' | 'checkout' | null
  lastSwapRequest: { day: DayOfWeek; slot: 'cd' | 'ld'; mealType: MealType } | null

  // Actions
  updateUser: (index: number, patch: Partial<UserProfile>) => void
  addUser: () => void
  removeUser: (index: number) => void
  toggleCookDay: (day: DayOfWeek) => void
  toggleMeal: (meal: MealType) => void
  setMacroConsideration: (patch: Partial<MacroConsideration>) => void
  setDietType: (d: DietType) => void
  setLocale: (l: Locale) => void
  setAllergies: (a: string) => void
  setNotes: (n: string) => void
  setScoopSize: (s: number) => void
  setBulkItems: (b: string) => void
  setPicnicCredentials: (patch: Partial<Store['picnicCredentials']>) => void
  setActiveTab: (t: 'setup' | 'plan' | 'groceries') => void
  setGroceryList: (list: GroceryItem[]) => void
  toggleGroceryItem: (index: number) => void
  updateGroceryQty: (index: number, qty: string) => void
  resetGroceries: () => void
  setWeekPlan: (plan: WeekPlan) => void
  updateMeal: (day: DayOfWeek, slot: 'cd' | 'ld', mealType: MealType, mealData: MealData) => void
  setBulkAllocations: (allocs: BulkAllocation[]) => void
  setGenerating: (val: boolean, status?: string) => void
  setError: (err: string | null) => void
  setNotice: (msg: string | null) => void
  retryLastAction: () => Promise<void>

  // Async actions
  generateWeekPlan: () => Promise<void>
  swapMeal: (day: DayOfWeek, slot: 'cd' | 'ld', mealType: MealType) => Promise<void>
  allocateBulk: () => Promise<void>
  checkoutGroceries: () => Promise<void>
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // Initial state
      users: [DEFAULT_USER_A, DEFAULT_USER_B],
      cookDays: ['Mon', 'Wed'],
      meals: ['Lunch', 'Dinner'],
      macroConsideration: {
        protein: true,
        calories: true,
        carbs: true,
        fat: true,
      },
      dietType: 'No restriction',
      locale: 'Generic English',
      allergies: '',
      notes: '',
      scoopSize: 240,
      bulkItems: '',
      picnicCredentials: {
        email: '',
        password: '',
        authToken: '',
        sessionCookie: '',
        userId: '',
        apiKey: '',
      },

      weekPlan: {},
      groceryList: [],
      bulkAllocations: [],
      activeTab: 'setup',
      generationStatus: '',
      isGenerating: false,
      generationError: null,
      generationNotice: null,
      checkoutProvider: 'picnic',
      checkoutIntegrationMode: null,
      loadingDays: [],
      lastFailedAction: null,
      lastSwapRequest: null,

      // Sync actions
      updateUser: (index, patch) =>
        set((s) => ({
          users: s.users.map((user, i) => (i === index ? { ...user, ...patch } : user)),
        })),

      addUser: () =>
        set((s) => ({
          users: [...s.users, createDefaultUser(s.users.length)],
        })),

      removeUser: (index) =>
        set((s) => {
          if (s.users.length <= 1) return s
          return {
            users: s.users.filter((_, i) => i !== index),
          }
        }),

      toggleCookDay: (day) =>
        set((s) => ({
          cookDays: s.cookDays.includes(day)
            ? s.cookDays.filter((d) => d !== day)
            : [...s.cookDays, day],
        })),

      toggleMeal: (meal) =>
        set((s) => ({
          meals: s.meals.includes(meal)
            ? s.meals.filter((m) => m !== meal)
            : [...s.meals, meal],
        })),

      setMacroConsideration: (patch) =>
        set((s) => ({
          macroConsideration: {
            ...s.macroConsideration,
            ...patch,
          },
        })),

      setDietType: (dietType) => set({ dietType }),
      setLocale: (locale) => set({ locale }),
      setAllergies: (allergies) => set({ allergies }),
      setNotes: (notes) => set({ notes }),
      setScoopSize: (scoopSize) =>
        set((s) => {
          if (!Number.isFinite(scoopSize)) return { scoopSize: s.scoopSize }
          return { scoopSize: Math.min(1000, Math.max(50, scoopSize)) }
        }),
      setBulkItems: (bulkItems) =>
        set((s) => {
          if (bulkItems === s.bulkItems) return { bulkItems }
          return { bulkItems, bulkAllocations: [] }
        }),
      setPicnicCredentials: (patch) =>
        set((s) => ({
          picnicCredentials: {
            ...s.picnicCredentials,
            ...patch,
          },
        })),
      setActiveTab: (activeTab) => set({ activeTab }),

      setGroceryList: (groceryList) => set({ groceryList }),

      toggleGroceryItem: (index) =>
        set((s) => ({
          groceryList: s.groceryList.map((item, i) =>
            i === index ? { ...item, checked: !item.checked } : item
          ),
        })),

      updateGroceryQty: (index, qty) =>
        set((s) => ({
          groceryList: s.groceryList.map((item, i) =>
            i === index ? { ...item, qty } : item
          ),
        })),

      resetGroceries: () =>
        set((s) => ({
          groceryList: s.groceryList.map((item) => ({ ...item, checked: false })),
        })),

      setWeekPlan: (weekPlan) => set({ weekPlan }),

      updateMeal: (day, slot, mealType, mealData) => {
        const key = mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner'
        set((s) => {
          const existing: DayPlanData = s.weekPlan[day] ?? { cd: {}, ld: {} }
          return {
            weekPlan: {
              ...s.weekPlan,
              [day]: {
                ...existing,
                [slot]: {
                  ...existing[slot],
                  [key]: mealData,
                },
              },
            },
          }
        })
      },

      setBulkAllocations: (bulkAllocations) => set({ bulkAllocations }),

      setGenerating: (val, status) =>
        set({ isGenerating: val, generationStatus: status ?? '' }),

      setError: (generationError) => set({ generationError }),
      setNotice: (generationNotice) => set({ generationNotice }),

      retryLastAction: async () => {
        const { isGenerating, lastFailedAction, lastSwapRequest } = get()
        if (isGenerating) return

        if (lastFailedAction === 'generate') {
          await get().generateWeekPlan()
          return
        }
        if (lastFailedAction === 'checkout') {
          await get().checkoutGroceries()
          return
        }
        if (lastFailedAction === 'swap' && lastSwapRequest) {
          await get().swapMeal(lastSwapRequest.day, lastSwapRequest.slot, lastSwapRequest.mealType)
          return
        }

        set({
          generationError: 'Nothing to retry. Please run the action again.',
          lastFailedAction: null,
          lastSwapRequest: null,
        })
      },

      // Async: generate full week plan
      generateWeekPlan: async () => {
        const { users, cookDays, meals, allergies, scoopSize, locale, bulkItems, notes, dietType, macroConsideration } = get()
        const usersForPayload = normalizeUsersForPayload(applyGlobalDietFallback(users, dietType))

        set({
          isGenerating: true,
          activeTab: 'plan',
          generationError: null,
          generationNotice: null,
          generationStatus: 'Generating a fresh plan. Keeping your current plan visible until it succeeds...',
          lastFailedAction: null,
          lastSwapRequest: null,
        })

        const sortedDays = [...cookDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
        const allLoadingDays: DayOfWeek[] = []
        sortedDays.forEach((day) => {
          if (!allLoadingDays.includes(day)) allLoadingDays.push(day)
          const nextDay = DAY_ORDER[(DAY_ORDER.indexOf(day) + 1) % 7]
          if (!allLoadingDays.includes(nextDay)) allLoadingDays.push(nextDay)
        })
        set({ loadingDays: allLoadingDays, generationStatus: 'Generating your new plan...' })

        try {
          const response = await generatePlanApi({
            users: usersForPayload,
            macroConsideration,
            cookDays,
            meals,
            locale,
            allergies,
            notes,
            scoopSize,
            bulkItems,
          })

          set({
            weekPlan: response.weekPlan,
            groceryList: response.groceryList,
            bulkAllocations: [],
            generationNotice: `Plan generated in ${Math.round(response.generationDurationMs / 1000)}s.`,
            generationStatus: '',
            lastFailedAction: null,
          })
        } catch (e) {
          set({
            generationError: `${(e as Error).message} Your current plan is unchanged.`,
            lastFailedAction: 'generate',
          })
        } finally {
          set({ isGenerating: false, generationStatus: '', loadingDays: [] })
        }
      },

      // Async: swap a single meal
      swapMeal: async (day, slot, mealType) => {
        const { users, allergies, scoopSize, dietType, macroConsideration, isGenerating } = get()
        if (isGenerating) {
          set({
            generationError: 'Wait for the current operation to finish before swapping meals.',
            generationNotice: null,
            lastFailedAction: null,
            lastSwapRequest: null,
          })
          return
        }

        const usersForPayload = normalizeUsersForPayload(applyGlobalDietFallback(users, dietType))

        set({
          generationError: null,
          generationNotice: null,
          generationStatus: `Swapping ${mealType.toLowerCase()} on ${day}...`,
          lastFailedAction: null,
          lastSwapRequest: null,
        })

        try {
          const parsed = await swapMealApi({
            users: usersForPayload,
            macroConsideration,
            day,
            slot,
            mealType,
            allergies,
            scoopSize,
          })
          get().updateMeal(day, slot, mealType, parsed)
          set({
            generationStatus: '',
            generationNotice: `${mealType} updated for ${day}.`,
            bulkAllocations: [],
            lastFailedAction: null,
            lastSwapRequest: null,
          })
        } catch (e) {
          set({
            generationStatus: '',
            generationError: `${(e as Error).message} Tap Retry to try this swap again.`,
            lastFailedAction: 'swap',
            lastSwapRequest: { day, slot, mealType },
          })
        }
      },

      // Async: allocate bulk ingredients
      allocateBulk: async () => {
        const { bulkItems, weekPlan, users } = get()
        if (!bulkItems.trim()) return

        try {
          const allocations = await allocateBulkLocally({
            users,
            bulkItems,
            weekPlan,
          })
          set({ bulkAllocations: allocations })
        } catch (e) {
          get().setError((e as Error).message)
        }
      },

      checkoutGroceries: async () => {
        const { groceryList, picnicCredentials } = get()
        const selectedItems = groceryList.filter((item) => item.checked)

        const invalidQtyItems = selectedItems.filter((item) => parseCheckoutQuantity(item.qty.trim()) === undefined)

        if (invalidQtyItems.length > 0) {
          const invalidNames = invalidQtyItems.map((item) => item.item).join(', ')
          set({
            generationError: `Update quantity to a whole number greater than 0 for: ${invalidNames}. Example: 1, 2, 3.`,
            generationNotice: null,
            lastFailedAction: 'checkout',
          })
          return
        }

        const products = selectedItems.map((item) => ({
          query: item.item.trim(),
          quantity: parseCheckoutQuantity(item.qty.trim()) ?? 1,
        }))

        if (products.length === 0) {
          set({
            generationError: 'Select at least one grocery item to checkout.',
            generationNotice: null,
            lastFailedAction: 'checkout',
          })
          return
        }

        set({
          isGenerating: true,
          generationError: null,
          generationNotice: null,
          generationStatus: 'Syncing selected items and quantities to store cart...',
          lastFailedAction: null,
        })
        try {
          const auth = {
            email: picnicCredentials.email.trim(),
            password: picnicCredentials.password,
            authToken: picnicCredentials.authToken.trim(),
            sessionCookie: picnicCredentials.sessionCookie.trim(),
            userId: picnicCredentials.userId.trim(),
            apiKey: picnicCredentials.apiKey.trim(),
          }

          const hasAuth = Boolean(
            auth.authToken ||
            auth.sessionCookie ||
            (auth.userId && auth.apiKey) ||
            (auth.email && auth.password)
          )

          if (!hasAuth) {
            set({
              generationError: 'Add Picnic credentials in Setup before checkout (email/password, token/session, or userId+apiKey).',
              generationNotice: null,
              lastFailedAction: 'checkout',
            })
            return
          }

          const result = await picnicCheckout({ products, auth })
          const providerLabel = result.provider === 'picnic' ? 'Picnic' : 'Store'
          const modeLabel = result.integrationMode === 'live' ? 'live mode' : 'simulated mode'
          const failures = result.cartUpdated.filter((item) => item.status !== 'added')
          if (failures.length > 0) {
            const details = failures.map((f) => `${f.query}: ${f.status}`).join('; ')
            const addedCount = result.cartUpdated.length - failures.length
            const addedQuerySet = new Set(
              result.cartUpdated
                .filter((item) => item.status === 'added')
                .map((item) => item.query.trim().toLowerCase())
            )

            set((s) => ({
              groceryList: s.groceryList.map((item) => {
                if (!item.checked) return item
                const normalized = item.item.trim().toLowerCase()
                if (!addedQuerySet.has(normalized)) return item
                return { ...item, checked: false }
              }),
              generationError: `${providerLabel} checkout (${modeLabel}) partially failed: ${details}. Added ${addedCount} item(s) to cart. Added items were cleared from selection to avoid duplicate retry. Fix listed items and retry checkout.`,
              generationNotice: null,
              checkoutProvider: result.provider,
              checkoutIntegrationMode: result.integrationMode,
              lastFailedAction: 'checkout',
            }))
          } else {
            set((s) => ({
              groceryList: s.groceryList.map((item) => ({ ...item, checked: false })),
              generationNotice:
                result.integrationMode === 'live'
                  ? `${providerLabel} checkout completed in live mode. Selected items were added to your cart and cleared from selection.`
                  : `${providerLabel} checkout ran in simulated mode. No live cart changes were made; selected items were cleared from selection.`,
              checkoutProvider: result.provider,
              checkoutIntegrationMode: result.integrationMode,
              lastFailedAction: null,
            }))
          }
        } catch (e) {
          set({
            generationError: `${(e as Error).message} Check your connection and retry checkout.`,
            lastFailedAction: 'checkout',
          })
        } finally {
          set({ isGenerating: false, generationStatus: '' })
        }
      },
    }),
    {
      name: 'prepwise-store',
      partialize: (state) => ({
        users: state.users,
        cookDays: state.cookDays,
        meals: state.meals,
        macroConsideration: state.macroConsideration,
        dietType: state.dietType,
        locale: state.locale,
        allergies: state.allergies,
        notes: state.notes,
        scoopSize: state.scoopSize,
        bulkItems: state.bulkItems,
      }),
    }
  )
)
