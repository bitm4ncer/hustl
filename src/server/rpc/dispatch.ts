import { RPC } from './registry'
import type { RpcContext } from './registry'

export type RpcErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'INTERNAL'

export class RpcError extends Error {
  constructor(
    readonly code: RpcErrorCode,
    message: string
  ) {
    super(message)
  }
}

export async function dispatchRpc(
  method: string,
  args: unknown[],
  ctx: RpcContext
): Promise<unknown> {
  const entry = RPC[method]
  if (!entry) throw new RpcError('NOT_FOUND', 'Unknown method')

  const parsed = entry.schema.safeParse(args)
  if (!parsed.success) {
    throw new RpcError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid arguments')
  }

  try {
    return await entry.handler(ctx, parsed.data)
  } catch (error) {
    if (error instanceof RpcError) throw error
    // Fachliche Fehler der Core-Schicht („E-Rechnung nicht möglich: …",
    // „Ein Entwurf wird direkt bearbeitet …") müssen beim Nutzer ankommen —
    // in der Desktop-App kamen sie unverändert an. Interne Details bleiben
    // draußen, weil nur die Meldung weitergereicht wird.
    if (error instanceof Error && error.message) {
      console.error(`[rpc] ${method} failed:`, error)
      throw new RpcError('VALIDATION', error.message)
    }
    console.error(`[rpc] ${method} failed:`, error)
    throw new RpcError('INTERNAL', 'Internal error')
  }
}
