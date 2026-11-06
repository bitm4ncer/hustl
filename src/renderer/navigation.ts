import type { View } from './components/Sidebar'
import type { IconName } from './components/Icon'
import { t } from './i18n'

export type NavView = View | 'more'

export interface NavItem {
  view: NavView
  label: string
  icon: IconName
}

/** Built per render so the labels follow the active language. */
export function getTabs(): NavItem[] {
  return [
    { view: 'todos', label: t.nav.todos, icon: 'file-check' },
    { view: 'projects', label: t.nav.projects, icon: 'layout' },
    { view: 'invoices', label: t.nav.invoices, icon: 'file-invoice' },
    { view: 'finance', label: t.nav.finance, icon: 'coin-euro' },
    { view: 'more', label: t.app.more, icon: 'dots' },
  ]
}

export function getOverflow(): NavItem[] {
  return [
    { view: 'clients', label: t.nav.clients, icon: 'users' },
    { view: 'offers', label: t.nav.offers, icon: 'file-check' },
    { view: 'timeline', label: t.nav.timeline, icon: 'timeline' },
    { view: 'settings', label: t.nav.settings, icon: 'settings' },
  ]
}

export function isOverflowView(view: View): boolean {
  return getOverflow().some((item) => item.view === view)
}
