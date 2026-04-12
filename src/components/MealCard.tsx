import { useState } from 'react'
import type { MealData, MealType, UserProfile } from '../types'

interface Props {
  meal: MealData
  mealType: MealType
  users: UserProfile[]
  onSwap: () => void
  isSwapping?: boolean
  isLeftover?: boolean
}

function toShortLines(value: string, maxLines = 6): string[] {
  return value
    .split(/[\n;]+|\.(?=\s|$)/)
    .map((line) => line.trim().replace(/^[-*\d)\s.]+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, maxLines)
}

function parseSplitTableFromText(split: string, users: UserProfile[]): Array<{ ingredient: string; allocations: Array<{ user: string; amount: string }> }> {
  const lines = toShortLines(split, 12)
  if (lines.length === 0) return []

  return lines
    .map((line) => {
      const [ingredientRaw, allocationsRaw = ''] = line.split(':')
      const ingredient = ingredientRaw?.trim() || ''
      if (!ingredient) return null

      const allocations = users.map((user, index) => {
        const alias = `User ${index + 1}`
        const segments = allocationsRaw
          .split(',')
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0)

        const matchedSegment = segments.find((segment) => {
          const lower = segment.toLowerCase()
          return lower.includes(user.name.toLowerCase()) || lower.includes(alias.toLowerCase())
        })

        if (!matchedSegment) {
          return { user: user.name, amount: '-' }
        }

        const withoutUser = matchedSegment
          .replace(new RegExp(user.name, 'ig'), '')
          .replace(new RegExp(alias, 'ig'), '')
          .replace(/\s+/g, ' ')
          .trim()

        return {
          user: user.name,
          amount: withoutUser || matchedSegment,
        }
      })

      return {
        ingredient,
        allocations,
      }
    })
    .filter((row): row is { ingredient: string; allocations: Array<{ user: string; amount: string }> } => Boolean(row))
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchesUserLabel(label: string, user: UserProfile, index: number): boolean {
  const token = normalizeToken(label)
  if (!token) return false

  const aliases = [
    normalizeToken(user.name),
    normalizeToken(`user ${index + 1}`),
    normalizeToken(`member ${index + 1}`),
    normalizeToken(`person ${index + 1}`),
  ]

  return aliases.some((alias) => alias.length > 0 && (token === alias || token.includes(alias) || alias.includes(token)))
}

export default function MealCard({ meal, mealType, users, onSwap, isSwapping, isLeftover }: Props) {
  const [showPlating, setShowPlating] = useState(true)
  const splitRows = meal.splitTable && meal.splitTable.length > 0
    ? meal.splitTable
    : parseSplitTableFromText(meal.split, users)
  const volLines = toShortLines(meal.vol)
  const recipeLines = toShortLines(meal.quickRecipe || '', 3)
  const portions = meal.portions && meal.portions.length > 0
    ? meal.portions
    : [
      meal.pA && users[0] ? { user: users[0].name, g: meal.pA.g, kcal: meal.pA.kcal } : null,
      meal.pB && users[1] ? { user: users[1].name, g: meal.pB.g, kcal: meal.pB.kcal } : null,
    ].filter(Boolean) as Array<{ user: string; g: number; kcal: number }>

  return (
    <div className={`meal-card${isLeftover ? ' leftover' : ''}`}>
      <div className="meal-card-header">
        <div>
          <div className="meal-type-label">{mealType}</div>
          <div className="meal-name">{meal.name}</div>
        </div>
        <button
          className="btn-swap"
          onClick={onSwap}
          disabled={isSwapping}
          title="Swap meal"
        >
          {isSwapping
            ? <span className="spinner spinner--light" style={{ width: '12px', height: '12px', borderWidth: '2px', borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'var(--text)' }} />
            : '↺ Swap'}
        </button>
      </div>

      {meal.pan && (
        <div className="meal-pan">
          <span>Pan: </span>{meal.pan}
        </div>
      )}

      <div className="macro-boxes">
        {portions.map((portion, idx) => (
          <div key={`${portion.user}-${idx}`} className={`macro-box ${idx % 2 === 0 ? 'macro-box--a' : 'macro-box--b'}`}>
            <div className="macro-box-name">{portion.user}</div>
            <div className="macro-protein">
              {portion.g}<span>g P</span>
            </div>
            <div className="macro-kcal">{portion.kcal} kcal</div>
          </div>
        ))}
      </div>

      {(meal.split || meal.vol || (meal.quickRecipe && meal.quickRecipe.trim().length > 0)) && (
        <>
          <button
            className="plating-toggle"
            onClick={() => setShowPlating((v) => !v)}
          >
            {showPlating ? '▾' : '▸'} Plating &amp; Volumetric
          </button>

          {showPlating && (
            <div className="plating-content">
              {splitRows.length > 0 && (
                <div className="callout-split">
                  <div className="callout-title">Plating Split</div>
                  <div className="split-table-wrap">
                    <table className="split-table">
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          {users.map((user) => (
                            <th key={`head-${user.name}`}>{user.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {splitRows.map((row, idx) => (
                          <tr key={`row-${row.ingredient}-${idx}`}>
                            <td>{row.ingredient}</td>
                            {users.map((user, userIndex) => {
                              const allocation = row.allocations.find((item) => matchesUserLabel(item.user, user, userIndex))
                              return <td key={`cell-${idx}-${user.name}`}>{allocation?.amount || '-'}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {volLines.length > 0 && (
                <div className="callout-vol">
                  <div className="callout-title">Volumetric</div>
                  <div className="callout-list">
                    {volLines.map((line, idx) => (
                      <div key={`vol-${idx}`} className="callout-item">{line}</div>
                    ))}
                  </div>
                </div>
              )}
              {recipeLines.length > 0 && (
                <div className="callout-recipe">
                  <div className="callout-title">Quick Rough Recipe</div>
                  <div className="callout-list">
                    {recipeLines.map((line, idx) => (
                      <div key={`recipe-${idx}`} className="callout-item">{idx + 1}. {line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
