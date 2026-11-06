import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHttpClient } from '../../src/renderer/lib/http-client'

afterEach(() => vi.unstubAllGlobals())

describe('http client', () => {
  it('ruft /api/rpc/<methode> mit args auf', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: [1, 2] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpClient()
    await expect(api.listClients()).resolves.toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rpc/listClients',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'x-hustl-client': 'web' })
      })
    )
  })

  it('wirft bei ok:false einen Fehler mit Code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, error: { code: 'VALIDATION', message: 'bad' } }), {
          status: 400
        })
      )
    )
    const api = createHttpClient()
    await expect(api.getInvoice(1)).rejects.toThrow('bad')
  })
})
