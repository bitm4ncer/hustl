import type { HustlApi } from '../../main/ipc/channels'
import { createHttpClient } from './http-client'

/**
 * Electron (lokale Entwicklung) liefert `window.hustl` über den Preload.
 * Browser und die gepackte Shell sprechen HTTP.
 */
export const api: HustlApi =
  (window as unknown as { hustl?: HustlApi }).hustl ?? createHttpClient()
