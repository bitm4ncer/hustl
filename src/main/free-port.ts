import { createServer } from 'node:net'

function tryListen(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', (error) => {
      probe.close()
      reject(error)
    })
    probe.listen(port, host, () => {
      const address = probe.address()
      const bound = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(bound))
    })
  })
}

/**
 * Nimmt bevorzugt den gewünschten Port (stabile Origin für localStorage) und
 * fällt auf einen freien Port zurück. Zwischen Probe und `listen` liegt ein
 * kleines Zeitfenster; der Aufrufer versucht es deshalb bei Bedarf erneut.
 */
export async function findFreePort(
  host = '127.0.0.1',
  preferred?: number
): Promise<number> {
  if (preferred) {
    try {
      return await tryListen(host, preferred)
    } catch {
      // Port belegt: unten einen freien nehmen.
    }
  }
  return tryListen(host, 0)
}
