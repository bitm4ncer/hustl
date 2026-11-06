/** Läuft die Oberfläche in der Electron-Hülle (IPC) oder im Browser (HTTP)? */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { hustl?: unknown }).hustl)
}
