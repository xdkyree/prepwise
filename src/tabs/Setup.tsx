import { useStore } from '../store'
import WeekPreview from '../components/WeekPreview'
import type { CarbBase, DietType, Locale, MealType, DayOfWeek, UserProfile, MacroConsideration } from '../types'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Checkbox } from '../components/ui/checkbox'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner']
const CARB_BASES: CarbBase[] = ['Rice', 'Quinoa', 'Millet', 'Bulgur', 'Oats', 'Sweet potato', 'None']
const DIET_TYPES: DietType[] = ['No restriction', 'Vegetarian', 'Vegan', 'Pescatarian', 'Keto', 'Paleo']
const LOCALES: Locale[] = ['Netherlands AH/Jumbo', 'UK Tesco', 'Lidl/Aldi EU', 'Generic English']

type MacroKey = 'protein' | 'calories' | 'carbs' | 'fat'

const MACRO_FIELDS: { key: MacroKey; label: string; step: number; optional?: boolean }[] = [
  { key: 'protein',  label: 'Protein (g)',  step: 5, optional: true  },
  { key: 'calories', label: 'Calories',     step: 50 },
  { key: 'carbs',    label: 'Carbs (g)',    step: 5, optional: true  },
  { key: 'fat',      label: 'Fat (g)',      step: 5, optional: true  },
]

function Stepper({
  label,
  value,
  onChange,
  step = 5,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div className="macro-field">
      <label>{label}</label>
      <div className="stepper">
        <button className="stepper-btn" onClick={() => onChange(Math.max(0, value - step))}>▼</button>
        <input
          className="stepper-input"
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button className="stepper-btn" onClick={() => onChange(value + step)}>▲</button>
      </div>
    </div>
  )
}

export default function Setup() {
  const {
    users, updateUser, addUser, removeUser,
    cookDays, meals, toggleCookDay, toggleMeal,
    macroConsideration, setMacroConsideration,
    dietType, locale, allergies, notes,
    setDietType, setLocale, setAllergies, setNotes,
    picnicCredentials, setPicnicCredentials,
    scoopSize, setScoopSize, bulkItems, setBulkItems,
    isGenerating, generateWeekPlan,
  } = useStore()

  const hasInvalidUser = users.some((u) => {
    if (macroConsideration.calories && (!Number.isFinite(u.calories) || u.calories <= 0)) return true
    if (macroConsideration.protein && (!Number.isFinite(u.protein) || u.protein < 0)) return true
    if (macroConsideration.carbs && (!Number.isFinite(u.carbs) || u.carbs < 0)) return true
    if (macroConsideration.fat && (!Number.isFinite(u.fat) || u.fat < 0)) return true
    return false
  })
  const hasInvalidScoopSize = !Number.isFinite(scoopSize) || scoopSize < 50 || scoopSize > 1000
  const canGenerate = users.length > 0 && cookDays.length > 0 && meals.length > 0 && !hasInvalidUser && !hasInvalidScoopSize

  const validationMessage =
    users.length === 0
      ? 'Add at least one household member.'
      : cookDays.length === 0
        ? 'Select at least one cook day.'
        : meals.length === 0
          ? 'Select at least one meal type.'
          : hasInvalidUser
            ? 'Selected macro targets must be valid (calories > 0, others >= 0).'
            : hasInvalidScoopSize
              ? 'Scoop size must be between 50ml and 1000ml.'
            : ''

  const macroLabels: Array<{ key: keyof MacroConsideration; label: string }> = [
    { key: 'protein', label: 'Protein' },
    { key: 'calories', label: 'Calories' },
    { key: 'carbs', label: 'Carbs' },
    { key: 'fat', label: 'Fat' },
  ]

  return (
    <div>
      {/* 01 USER PROFILES */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">01</span>
          <span className="section-title">User Profiles</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div className="schedule-label">Household members: <Badge variant="muted">{users.length}</Badge></div>
          <Button variant="outline" size="sm" onClick={addUser} disabled={users.length >= 8}>+ Add Member</Button>
        </div>

        <div className="schedule-label" style={{ marginBottom: '6px' }}>Include Macros In AI Planning</div>
        <div className="pill-group" style={{ marginBottom: '12px' }}>
          {macroLabels.map(({ key, label }) => (
            <label key={key} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Checkbox
                checked={macroConsideration[key]}
                onChange={(e) => setMacroConsideration({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="profiles-grid">
          {users.map((user: UserProfile, userIndex: number) => {
            const topClass = userIndex === 0 ? ' profile-card--a' : userIndex === 1 ? ' profile-card--b' : ''
            return (
              <Card key={`${user.name}-${userIndex}`} className={`profile-card${topClass}`}>
                <CardHeader style={{ padding: 0, marginBottom: '8px' }}>
                <div className="profile-name-row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`profile-dot ${userIndex % 2 === 0 ? 'profile-dot--a' : 'profile-dot--b'}`} />
                    <input
                      className="profile-name-input"
                      value={user.name}
                      onChange={(e) => updateUser(userIndex, { name: e.target.value })}
                      placeholder="Name"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="btn-reset"
                    onClick={() => removeUser(userIndex)}
                    disabled={users.length <= 1}
                    title={users.length <= 1 ? 'At least one member is required' : 'Remove member'}
                  >
                    Remove
                  </Button>
                </div>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                <div className="macros-grid">
                  {MACRO_FIELDS.map(({ key, label, step, optional }) => (
                    <Stepper
                      key={key}
                      label={optional ? `${label} (${macroConsideration[key] ? 'enabled' : 'ignored'})` : `${label} (${macroConsideration[key] ? 'enabled' : 'ignored'})`}
                      value={user[key]}
                      onChange={(v) => updateUser(userIndex, { [key]: Number.isFinite(v) ? Math.max(0, v) : 0 })}
                      step={step}
                    />
                  ))}
                </div>
                <div className="select-field">
                  <label>Carb Base</label>
                  <select
                    value={user.carbBase}
                    onChange={(e) => updateUser(userIndex, { carbBase: e.target.value as CarbBase })}
                  >
                    {CARB_BASES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="select-field">
                  <label>Diet Type</label>
                  <select
                    value={user.diet}
                    onChange={(e) => updateUser(userIndex, { diet: e.target.value as DietType })}
                  >
                    {DIET_TYPES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* 02 COOKING SCHEDULE */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">02</span>
          <span className="section-title">Cooking Schedule</span>
        </div>

        <div className="schedule-row">
          <div>
            <div className="schedule-label">Cook Days</div>
            <div className="pill-group">
              {DAYS.map((day) => (
                <button
                  key={day}
                  className={`pill ${cookDays.includes(day) ? 'active' : ''}`}
                  onClick={() => toggleCookDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="schedule-label">Meals to Prep</div>
            <div className="pill-group">
              {MEAL_TYPES.map((meal) => (
                <button
                  key={meal}
                  className={`pill ${meals.includes(meal) ? 'active' : ''}`}
                  onClick={() => toggleMeal(meal)}
                >
                  {meal}
                </button>
              ))}
            </div>
          </div>

          <WeekPreview cookDays={cookDays} meals={meals} />
        </div>
      </div>

      {/* 03 DIET & LOCALE */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">03</span>
          <span className="section-title">Diet &amp; Locale</span>
        </div>

        <div className="diet-grid">
          <div className="select-field">
            <label>Diet Type</label>
            <select
              value={dietType}
              onChange={(e) => setDietType(e.target.value as DietType)}
            >
              {DIET_TYPES.map((d) => <option key={d}>{d}</option>)}
            </select>
            <div className="field-hint">
              Used as a fallback only for members set to "No restriction". Member-level diet settings override this.
            </div>
          </div>

          <div className="select-field">
            <label>Supermarket / Locale</label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {LOCALES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>

          <div className="text-input-field">
            <label>Allergies / Avoid</label>
            <input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. nuts, shellfish, gluten"
            />
          </div>

          <div className="text-input-field">
            <label>Extra Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. prefer spicy, no soggy food"
            />
          </div>
        </div>
      </div>

      {/* 04 KITCHEN TOOLS & BULK INGREDIENTS */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">04</span>
          <span className="section-title">Kitchen Tools &amp; Bulk Ingredients</span>
        </div>

        <div className="kitchen-row">
          {/* Left column */}
          <div>
            <div className="text-input-field">
              <label>Custom Scoop Size (ml)</label>
              <input
                type="number"
                value={scoopSize}
                onChange={(e) => setScoopSize(Number(e.target.value))}
                min={50}
                max={1000}
              />
            </div>

            <div className="text-input-field">
              <label>Items on Hand (bulk)</label>
              <input
                value={bulkItems}
                onChange={(e) => setBulkItems(e.target.value)}
                placeholder="e.g. 6 bell peppers, 500g chicken"
              />
            </div>

            <div className="section-header" style={{ marginTop: '12px' }}>
              <span className="section-num">P</span>
              <span className="section-title">Picnic Credentials (Live Checkout)</span>
            </div>

            <div className="text-input-field">
              <label>Picnic Email</label>
              <input
                value={picnicCredentials.email}
                onChange={(e) => setPicnicCredentials({ email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>

            <div className="text-input-field">
              <label>Picnic Password</label>
              <input
                type="password"
                value={picnicCredentials.password}
                onChange={(e) => setPicnicCredentials({ password: e.target.value })}
                placeholder="Your Picnic password"
              />
            </div>

            <div className="field-hint">
              Alternative auth options are supported: auth token/session cookie or userId + apiKey.
            </div>

            <div className="text-input-field">
              <label>Auth Token (optional)</label>
              <input
                value={picnicCredentials.authToken}
                onChange={(e) => setPicnicCredentials({ authToken: e.target.value })}
                placeholder="Bearer token"
              />
            </div>

            <div className="text-input-field">
              <label>Session Cookie (optional)</label>
              <input
                value={picnicCredentials.sessionCookie}
                onChange={(e) => setPicnicCredentials({ sessionCookie: e.target.value })}
                placeholder="_session=..."
              />
            </div>

            <div className="kitchen-row" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="text-input-field">
                <label>User ID (optional)</label>
                <input
                  value={picnicCredentials.userId}
                  onChange={(e) => setPicnicCredentials({ userId: e.target.value })}
                  placeholder="Picnic user id"
                />
              </div>

              <div className="text-input-field">
                <label>API Key (optional)</label>
                <input
                  value={picnicCredentials.apiKey}
                  onChange={(e) => setPicnicCredentials({ apiKey: e.target.value })}
                  placeholder="Picnic API key"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-section">
        {!canGenerate && (
          <div className="error-banner" style={{ marginBottom: '0', width: '100%' }}>
            <span>{validationMessage}</span>
          </div>
        )}
        <Button
          variant="default"
          size="lg"
          className="btn-cta"
          onClick={generateWeekPlan}
          disabled={isGenerating || !canGenerate}
        >
          {isGenerating ? (
            <>
              <span className="spinner" />
              Generating…
            </>
          ) : (
            'Generate Week Plan →'
          )}
        </Button>
        <div className="cta-summary">
          {users.length} member{users.length !== 1 ? 's' : ''} · {cookDays.length} cook day{cookDays.length !== 1 ? 's' : ''} · {meals.length} meal{meals.length !== 1 ? 's' : ''} · {locale}
        </div>
      </div>
    </div>
  )
}
