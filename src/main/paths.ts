import { join } from 'node:path'

/**
 * Nutzdaten der Standalone-App liegen in einem Unterordner des Electron-
 * userData. Dadurch bleiben Chromium-Profil, Caches und Cookies außerhalb des
 * Archivs und außerhalb des Restore-Swaps.
 */
export function standaloneDataDir(userData: string): string {
  return join(userData, 'data')
}
