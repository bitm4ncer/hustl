import { t } from '../i18n'
import { translateBackendMessage } from '../i18n/backend'

export interface SessionInfo {
  authenticated: boolean
  needsSetup: boolean
  credentials: { label: string }[]
}

export interface Challenge<T> {
  challengeId: string
  options: T
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-hustl-client': 'web',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) {
    throw new Error(translateBackendMessage(data?.error?.message ?? t.common.requestFailed))
  }
  return data as T
}

export function getSession(): Promise<SessionInfo> {
  return request<SessionInfo>('/api/auth/session')
}

export function beginLogin(): Promise<Challenge<unknown>> {
  return request<Challenge<unknown>>('/api/auth/login/begin', {})
}

export function finishLogin(challengeId: string, response: unknown): Promise<{ ok: true }> {
  return request('/api/auth/login/finish', { challengeId, response })
}

export function beginRegister(token?: string): Promise<Challenge<unknown>> {
  return request<Challenge<unknown>>('/api/auth/register/begin', token ? { token } : {})
}

export function finishRegister(
  challengeId: string,
  response: unknown,
  label?: string
): Promise<{ ok: true; recoveryCodes: string[] }> {
  return request('/api/auth/register/finish', { challengeId, response, label })
}

export function recover(code: string): Promise<Challenge<unknown>> {
  return request<Challenge<unknown>>('/api/auth/recover', { code })
}

export function logout(): Promise<{ ok: true }> {
  return request('/api/auth/logout', {})
}

export function revokeOtherSessions(): Promise<{ ok: true }> {
  return request('/api/auth/sessions/revoke-all', {})
}
