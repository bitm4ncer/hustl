import type { HustlApi } from '../../main/ipc/channels'
import { translateBackendMessage } from '../i18n/backend'
import { t } from '../i18n'

interface RpcResponse<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

async function rpc<T>(method: string, args: unknown[]): Promise<T> {
  const response = await fetch(`/api/rpc/${method}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-hustl-client': 'web',
    },
    body: JSON.stringify({ args }),
  })

  const body = (await response.json()) as RpcResponse<T>
  if (!body.ok) throw new Error(translateBackendMessage(body.error?.message ?? t.common.requestFailed))
  return body.data as T
}

async function upload(path: string, bytes: Uint8Array, filename: string): Promise<any> {
  const form = new FormData()
  form.append('file', new Blob([bytes as unknown as BlobPart]), filename)
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-hustl-client': 'web' },
    body: form,
  })
  const body = await response.json()
  if (!response.ok) {
    // Fastify-Fehler tragen die Meldung in `message`, RPC-Fehler in `error.message`.
    throw new Error(translateBackendMessage(body?.error?.message ?? body?.message ?? t.common.requestFailed))
  }
  return body
}

/**
 * Implementiert dasselbe Interface wie der Electron-Preload, spricht aber HTTP.
 * Ein Proxy, damit neue Methoden nicht doppelt gepflegt werden müssen — die
 * Allowlist liegt serverseitig in `src/server/rpc/registry.ts`.
 */
export function createHttpClient(): HustlApi {
  return new Proxy({} as HustlApi, {
    get(_target, property: string) {
      if (property === 'importExpensePdf') {
        return (bytes: Uint8Array, filename: string) =>
          upload('/api/uploads/expense', bytes, filename)
      }
      if (property === 'importBankStatement') {
        return (bytes: Uint8Array, filename: string) =>
          upload('/api/uploads/statement', bytes, filename)
      }
      if (property === 'exportFinanceMonth') {
        // Im Browser läuft der Export über die drei Download-Links der
        // Finanzseite. Der frühere Sammel-ZIP-Endpunkt existiert nicht mehr —
        // eine Navigation dorthin würde die App verlassen.
        return () =>
          Promise.reject(new Error(t.common.browserExportHint))
      }
      return (...args: unknown[]) => rpc(property, args)
    },
  })
}
