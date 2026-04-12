import { useState, useCallback } from 'react'
import { useStore } from '../store'
import MealCard from '../components/MealCard'
import SkeletonCard from '../components/SkeletonCard'
import type { DayOfWeek, MealType } from '../types'

const ALL_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Plan() {
  const {
    users,
    cookDays, meals, weekPlan, loadingDays,
    isGenerating, generationError,
    generateWeekPlan, swapMeal, setActiveTab,
  } = useStore()

  const [swappingKeys, setSwappingKeys] = useState<Set<string>>(new Set())

  const handleSwap = useCallback(
    async (cookDay: DayOfWeek, slot: 'cd' | 'ld', mealType: MealType) => {
      const key = `${cookDay}-${slot}-${mealType}`
      setSwappingKeys((prev) => new Set([...prev, key]))
      try {
        await swapMeal(cookDay, slot, mealType)
      } finally {
        setSwappingKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [swapMeal]
  )

  const isEmpty = Object.keys(weekPlan).length === 0 && !isGenerating && !generationError

  return (
    <div>
      <div className="plan-header-row">
        <span className="section-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          WEEK PLAN
        </span>
        <button
          className="btn-regen"
          onClick={generateWeekPlan}
          disabled={isGenerating}
        >
          {isGenerating ? '…' : '↺ Regenerate Plan'}
        </button>
      </div>

      {isEmpty && (
        <div className="empty-state">
          No plan generated yet.<br />
          Go to Setup to create your plan.
          <div style={{ marginTop: '12px' }}>
            <button className="btn-mid" onClick={() => setActiveTab('setup')}>
              Open Setup
            </button>
          </div>
        </div>
      )}

      {ALL_DAYS.map((day) => {
        const dayIdx = ALL_DAYS.indexOf(day)
        const prevDay = ALL_DAYS[(dayIdx + 6) % 7]
        const isCookDay = cookDays.includes(day)
        const isLeftoverDay = !isCookDay && cookDays.includes(prevDay)
        const isLoading = loadingDays.includes(day)

        if (!isCookDay && !isLeftoverDay) {
          // Rest day
          return (
            <div key={day} className="day-section">
              <div className="day-rest">
                {day.toUpperCase()} — rest day
              </div>
            </div>
          )
        }

        if (isCookDay) {
          const dayData = weekPlan[day]
          const hasMeals = dayData && Object.values(dayData.cd).some(Boolean)

          return (
            <div key={day} className="day-section">
              <div className="day-header">
                <span className="day-name">{day}</span>
                <span className="day-tag cook">🍳 Cook Day</span>
              </div>

              {isLoading && !hasMeals ? (
                <div className="meals-grid">
                  {meals.map((m) => <SkeletonCard key={m} />)}
                </div>
              ) : hasMeals ? (
                <div className="meals-grid">
                  {meals.map((mealType) => {
                    const key = mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner'
                    const meal = dayData.cd[key]
                    if (!meal) return null
                    const swapKey = `${day}-cd-${mealType}`
                    return (
                      <MealCard
                        key={mealType}
                        meal={meal}
                        mealType={mealType}
                        users={users}
                        onSwap={() => handleSwap(day, 'cd', mealType)}
                        isSwapping={swappingKeys.has(swapKey)}
                      />
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        }

        // Leftover day
        const prevDayData = weekPlan[prevDay]
        const hasLeftovers = prevDayData && Object.values(prevDayData.ld).some(Boolean)

        return (
          <div key={day} className="day-section">
            <div className="day-header">
              <span className="day-name">{day}</span>
              <span className="day-tag leftover">♻ Leftovers from {prevDay}</span>
            </div>

            {isLoading && !hasLeftovers ? (
              <div className="meals-grid">
                {meals.map((m) => <SkeletonCard key={m} />)}
              </div>
            ) : hasLeftovers ? (
              <div className="meals-grid">
                {meals.map((mealType) => {
                  const key = mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner'
                  const meal = prevDayData.ld[key]
                  if (!meal) return null
                  const swapKey = `${prevDay}-ld-${mealType}`
                  return (
                    <MealCard
                      key={mealType}
                      meal={meal}
                      mealType={mealType}
                      users={users}
                      onSwap={() => handleSwap(prevDay, 'ld', mealType)}
                      isSwapping={swappingKeys.has(swapKey)}
                      isLeftover
                    />
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
