import path from 'node:path'
import { realpathSync } from 'node:fs'

function invalid(): never {
  throw new Error('invalid path')
}

/** Absolute Pfade in beiden Schreibweisen — auch unter Linux erkannt. */
export function isAbsoluteStored(stored: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(stored)
}

/**
 * Stellt sicher, dass `candidate` echt unterhalb von `root` liegt.
 * `root` selbst ist kein gültiges Ziel.
 */
export function assertInside(root: string, candidate: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(candidate))
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) invalid()
  return candidate
}

/**
 * Übersetzt einen in der DB gespeicherten Pfad in einen absoluten Dateipfad
 * unterhalb von `dataDir`.
 *
 * Lehnt ab: leere Pfade, `..`, absolute Pfade, Laufwerksbuchstaben und
 * Symlinks, die aus `dataDir` herauszeigen. Nicht existierende Dateien sind
 * erlaubt (die lexikalische Prüfung bleibt gültig) — der Aufrufer behandelt
 * `ENOENT` selbst.
 */
export function resolveDataPath(dataDir: string, stored: string): string {
  if (!stored) invalid()
  const normalized = stored.replace(/\\/g, '/')
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) invalid()

  const root = path.resolve(dataDir)
  const candidate = path.resolve(root, normalized)
  assertInside(root, candidate)

  try {
    const realRoot = realpathSync(root)
    const realCandidate = realpathSync(candidate)
    assertInside(realRoot, realCandidate)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  return candidate
}

/**
 * Gegenstück: macht aus einem absoluten Pfad den in der DB gespeicherten
 * relativen Pfad (immer mit `/`, damit die DB plattformunabhängig bleibt).
 */
export function toStoredPath(dataDir: string, absolute: string): string {
  const root = path.resolve(dataDir)
  const rel = path.relative(root, path.resolve(absolute))
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) invalid()
  return rel.split(path.sep).join('/')
}
