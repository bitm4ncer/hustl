import type { ReactElement } from 'react'
import { getTabs } from '../navigation'
import type { NavView } from '../navigation'
import { Icon } from './Icon'

interface BottomNavProps {
  active: NavView
  onNavigate: (view: NavView) => void
}

export function BottomNav({ active, onNavigate }: BottomNavProps): ReactElement {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t md:hidden safe-bottom"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--border, rgba(0,0,0,.08))' }}
      aria-label="Hauptnavigation"
    >
      {getTabs().map((tab) => {
        const isActive = tab.view === active
        return (
          <button
            key={tab.view}
            type="button"
            onClick={() => onNavigate(tab.view)}
            aria-current={isActive ? 'page' : undefined}
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <Icon name={tab.icon} size={20} />
            <span className="max-w-full truncate">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
