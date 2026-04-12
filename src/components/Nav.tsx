import { useStore } from '../store'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

const TABS = [
  { id: 'setup' as const, label: '01 Setup' },
  { id: 'plan' as const, label: '02 Plan' },
  { id: 'groceries' as const, label: '03 Groceries' },
]

export default function Nav() {
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)

  return (
    <nav className="nav">
      <span className="nav-logo">
        PREPWISE <Badge variant="accent">beta</Badge>
      </span>
      <div className="nav-tabs">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            className={`nav-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </nav>
  )
}
