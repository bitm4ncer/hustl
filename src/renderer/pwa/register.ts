/// <reference types="vite-plugin-pwa/client" />

type UpdateFn = (reload?: boolean) => Promise<void>

let updateApp: UpdateFn | null = null

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if ((window as unknown as { hustl?: unknown }).hustl) return
  if (!('serviceWorker' in navigator)) return

  void import('virtual:pwa-register').then(({ registerSW }) => {
    updateApp = registerSW({
      immediate: true,
      // Neue Version gebaut: sofort übernehmen und die Seite neu laden,
      // statt bis zum nächsten manuellen Reload die alte Shell zu zeigen.
      onNeedRefresh() {
        void updateApp?.(true)
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        window.setInterval(() => {
          if (document.visibilityState === 'visible') void registration.update()
        }, 60_000)
      },
    })
  })
}
