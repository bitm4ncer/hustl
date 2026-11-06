import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { Button } from '../components/Button'
import { LanguageToggle } from '../components/LanguageToggle'
import { t } from '../i18n'
import { useLanguage } from '../i18n/LanguageProvider'
import { isElectronShell } from '../platform'
import { Field } from '../components/Field'
import {
  beginLogin,
  beginRegister,
  finishLogin,
  finishRegister,
  getSession,
  recover,
} from './auth-api'

type Screen = 'loading' | 'login' | 'setup' | 'recover' | 'codes' | 'ready'

function localToken(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('token') ?? ''
}

/**
 * Sperrt die Oberfläche, bis ein Passkey angemeldet ist. Im Electron-Dev-Modus
 * (lokaler IPC-Pfad) gibt es keine Server-Session und der Gate entfällt.
 */
export function AuthGate({ children }: { children: ReactNode }): ReactElement {
  const { lang } = useLanguage()
  const [screen, setScreen] = useState<Screen>(isElectronShell() ? 'ready' : 'loading')
  const [token, setToken] = useState(localToken())
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isElectronShell()) return
    let cancelled = false
    getSession()
      .then((session) => {
        if (cancelled) return
        if (session.authenticated) setScreen('ready')
        else if (session.needsSetup) setScreen('setup')
        else setScreen('login')
      })
      .catch(() => {
        if (!cancelled) setScreen('login')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const login = (): Promise<void> =>
    run(async () => {
      const challenge = await beginLogin()
      const response = await startAuthentication({ optionsJSON: challenge.options as never })
      await finishLogin(challenge.challengeId, response)
      setScreen('ready')
    })

  const register = (withToken: boolean): Promise<void> =>
    run(async () => {
      const challenge = await beginRegister(withToken ? token : undefined)
      const response = await startRegistration({ optionsJSON: challenge.options as never })
      const result = await finishRegister(
        challenge.challengeId,
        response,
        navigator.userAgent.includes('iPhone') ? 'iPhone' : t.auth.deviceName
      )
      setRecoveryCodes(result.recoveryCodes ?? [])
      setScreen('codes')
    })

  const recoverAccount = (): Promise<void> =>
    run(async () => {
      const challenge = await recover(code)
      const response = await startRegistration({ optionsJSON: challenge.options as never })
      await finishRegister(challenge.challengeId, response, t.auth.recoveryName)
      setScreen('ready')
    })

  if (screen === 'ready') return <>{children}</>

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      data-lang={lang}
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <div
        className="w-full max-w-sm rounded-[16px] p-6"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow, 0 10px 40px rgba(0,0,0,.2))' }}
      >
        <h1 className="mb-1 text-xl font-medium tracking-tight">Hustl</h1>

        {screen === 'loading' && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t.auth.loading}
          </p>
        )}

        {screen === 'login' && (
          <>
            <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.auth.loginHint}
            </p>
            <Button onClick={() => void login()} disabled={busy}>
              {busy ? t.auth.confirm : t.auth.login}
            </Button>
            <button
              type="button"
              onClick={() => setScreen('recover')}
              className="mt-4 block text-xs underline"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.auth.lost}
            </button>
          </>
        )}

        {screen === 'setup' && (
          <>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.auth.setupHintBefore}
              <code className="ml-1">/data/bootstrap-token.txt</code>
              {t.auth.setupHintAfter}
            </p>
            <Field label={t.auth.setupCode} value={token} onChange={setToken} />
            <div className="mt-4">
              <Button onClick={() => void register(true)} disabled={busy || token.trim() === ''}>
                {busy ? t.auth.confirm : t.auth.create}
              </Button>
            </div>
          </>
        )}

        {screen === 'recover' && (
          <>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.auth.recoverHint}
            </p>
            <Field label={t.auth.recoveryCode} value={code} onChange={setCode} />
            <div className="mt-4 flex gap-2">
              <Button onClick={() => void recoverAccount()} disabled={busy || code.trim() === ''}>
                {t.auth.next}
              </Button>
              <Button variant="ghost" onClick={() => setScreen('login')} disabled={busy}>
                {t.auth.back}
              </Button>
            </div>
          </>
        )}

        {screen === 'codes' && (
          <>
            <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.auth.codesHint}
            </p>
            <pre
              className="mb-4 grid gap-1 rounded-[10px] p-3 text-xs"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
            >
              {recoveryCodes.join('\n')}
            </pre>
            <Button onClick={() => setScreen('ready')}>{t.auth.codesSaved}</Button>
          </>
        )}

        {error && (
          <p className="mt-4 text-xs" style={{ color: 'var(--danger, #e5484d)' }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
