import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSession, finishLogin, beginRegister } from '../../src/renderer/auth/auth-api'

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('auth api', () => {
  it('liest die Session', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ authenticated: false, needsSetup: true, credentials: [] })
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSession()).resolves.toEqual({
      authenticated: false,
      needsSetup: true,
      credentials: [],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'same-origin' })
    )
  })

  it('schickt Login-Assertion mit Client-Header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await finishLogin('ch-1', { id: 'cred' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/login/finish')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-hustl-client']).toBe('web')
    expect(JSON.parse(String(init.body))).toEqual({ challengeId: 'ch-1', response: { id: 'cred' } })
  })

  it('wirft bei abgelehnter Registrierung', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: false, error: { message: 'Setup token required' } }, 403))
    )
    // The server speaks English on auth routes; the German UI translates it.
    await expect(beginRegister('wrong')).rejects.toThrow('Einrichtungscode erforderlich.')
  })
})
