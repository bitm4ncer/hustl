import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './components/Sidebar'
import type { View } from './components/Sidebar'
import { Projects } from './pages/Projects'
import { Todos } from './pages/Todos'
import { Timeline } from './pages/Timeline'
import { Invoices } from './pages/Invoices'
import { Offers } from './pages/Offers'
import { Finance } from './pages/Finance'
import { Clients } from './pages/Clients'
import { Settings } from './pages/Settings'
import { AuthGate } from './auth/AuthGate'
import { appMode } from './platform'
import { BottomNav } from './components/BottomNav'
import { MoreSheet } from './components/MoreSheet'
import { GlobalToast } from './components/GlobalToast'
import { installGlobalErrorToast } from './lib/notify'
import type { NavView } from './navigation'
import { isOverflowView } from './navigation'
import { useLanguage } from './i18n/LanguageProvider'

export default function App(): ReactElement {
  const { lang } = useLanguage()
  const [view, setView] = useState<View>('todos')
  const [moreOpen, setMoreOpen] = useState(false)

  // Einmalig: fehlgeschlagene Klicks dürfen nicht stumm bleiben.
  useEffect(installGlobalErrorToast, [])
  // Cross-page handoff: Projects → Invoices "create invoice from projects".
  const [invoiceSeed, setInvoiceSeed] = useState<{
    clientId: number
    projectIds: number[]
  } | null>(null)

  return (
    <AuthGate>
      <div
        className="flex flex-col h-screen overflow-hidden"
        data-lang={lang}
        style={{
          background: 'var(--bg)',
          color: 'var(--text)',
          // iOS: nicht unter Statusleiste/Notch rutschen.
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
      {appMode() === 'electron' && (
        <div className="drag-region shrink-0" style={{ height: 38 }} aria-hidden="true" />
      )}
      {appMode() !== 'electron' && (
        // Desktop-PWA mit window-controls-overlay: Platz für die Fensterknöpfe.
        <div
          className="drag-region shrink-0"
          style={{ height: 'env(titlebar-area-height, 0px)' }}
          aria-hidden="true"
        />
      )}
      <div className="flex flex-1 min-h-0 min-w-0">
        <Sidebar view={view} onNavigate={setView} />
        <main
          className="flex-1 min-w-0 overflow-y-auto px-4 pb-28 pt-4 md:px-8 md:pb-8 md:pt-6"
          style={{ scrollbarGutter: 'stable' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {view === 'projects' && (
                <Projects
                  onCreateInvoice={(clientId, projectIds) => {
                    setInvoiceSeed({ clientId, projectIds })
                    setView('invoices')
                  }}
                />
              )}
              {view === 'todos' && <Todos />}
              {view === 'timeline' && <Timeline />}
              {view === 'invoices' && (
                <Invoices seed={invoiceSeed} onConsumeSeed={() => setInvoiceSeed(null)} />
              )}
              {view === 'offers' && <Offers />}
              {view === 'finance' && <Finance />}
              {view === 'clients' && <Clients />}
              {view === 'settings' && <Settings />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNav
        active={moreOpen || isOverflowView(view) ? 'more' : view}
        onNavigate={(next: NavView) => {
          if (next === 'more') {
            setMoreOpen(true)
            return
          }
          setMoreOpen(false)
          setView(next)
        }}
      />
      <MoreSheet
        open={moreOpen}
        active={view}
        onClose={() => setMoreOpen(false)}
        onNavigate={(next) => setView(next)}
      />
      <GlobalToast />
      </div>
    </AuthGate>
  )
}
