import type { DayOfWeek, MealType } from '../types'

const ALL_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  cookDays: DayOfWeek[]
  meals: MealType[]
}

export default function WeekPreview({ cookDays, meals: _meals }: Props) {
  return (
    <div className="week-preview">
      {ALL_DAYS.map((day) => {
        const idx = ALL_DAYS.indexOf(day)
        const prevDay = ALL_DAYS[(idx + 6) % 7]
        const isCook = cookDays.includes(day)
        const isLeftover = !isCook && cookDays.includes(prevDay)
        const type = isCook ? 'cook' : isLeftover ? 'leftover' : 'rest'

        return (
          <div key={day} className={`week-day-card ${type}`}>
            <div className="week-day-label">{day.toUpperCase()}</div>
            <span className="week-day-icon">
              {type === 'cook' ? '🍳' : type === 'leftover' ? '♻' : '—'}
            </span>
            <div className="week-day-status">
              {type === 'cook' ? 'COOK' : type === 'leftover' ? 'LFTOVR' : 'REST'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
