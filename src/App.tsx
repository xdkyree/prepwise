import { useStore } from './store'
import Nav from './components/Nav'
import StatusBanner from './components/StatusBanner'
import Setup from './tabs/Setup'
import Plan from './tabs/Plan'
import Groceries from './tabs/Groceries'

export default function App() {
  const activeTab = useStore((s) => s.activeTab)

  return (
    <div>
      <Nav />
      <StatusBanner />
      <div className="page-content">
        {activeTab === 'setup' && <Setup />}
        {activeTab === 'plan' && <Plan />}
        {activeTab === 'groceries' && <Groceries />}
      </div>
    </div>
  )
}
