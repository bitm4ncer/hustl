export function isElectronShell(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { hustl?: unknown }).hustl)
}

export function appMode(): 'electron' | 'web' {
  return isElectronShell() ? 'electron' : 'web'
}
