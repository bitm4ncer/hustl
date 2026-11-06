import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

const CHALLENGE_TTL_MS = 5 * 60_000
const SESSION_TTL_MS = 30 * 24 * 3600_000

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function iso(date: Date): string {
  return date.toISOString()
}

// --- Challenges -------------------------------------------------------------

export function createChallenge(
  db: DatabaseSync,
  kind: 'login' | 'register',
  value?: string
): { id: string; challenge: string } {
  const id = randomUUID()
  const challenge = value ?? randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  db.prepare(
    'INSERT INTO auth_challenges (id, kind, challenge, expires_at) VALUES (?, ?, ?, ?)'
  ).run(id, kind, challenge, iso(expiresAt))
  return { id, challenge }
}

/** Einmalig: die Zeile wird beim Einlösen gelöscht, auch wenn sie abgelaufen ist. */
export function consumeChallenge(
  db: DatabaseSync,
  id: string,
  kind: 'login' | 'register',
  now: Date = new Date()
): string | null {
  const row = db
    .prepare('SELECT challenge, expires_at FROM auth_challenges WHERE id = ? AND kind = ?')
    .get(id, kind) as { challenge: string; expires_at: string } | undefined
  if (!row) return null
  db.prepare('DELETE FROM auth_challenges WHERE id = ?').run(id)
  return row.expires_at > iso(now) ? row.challenge : null
}

// --- Sessions ---------------------------------------------------------------

export function createSession(
  db: DatabaseSync,
  meta: { userAgent: string | null; ip: string | null },
  now: Date = new Date()
): { id: string; token: string } {
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  db.prepare(
    `INSERT INTO auth_sessions (id, token_hash, created_at, last_seen_at, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    hashToken(token),
    iso(now),
    iso(now),
    iso(new Date(now.getTime() + SESSION_TTL_MS)),
    meta.userAgent,
    meta.ip
  )
  return { id, token }
}

export function getSession(
  db: DatabaseSync,
  token: string,
  now: Date = new Date()
): { id: string; expiresAt: string } | null {
  const row = db
    .prepare('SELECT id, expires_at FROM auth_sessions WHERE token_hash = ?')
    .get(hashToken(token)) as { id: string; expires_at: string } | undefined
  if (!row) return null
  if (row.expires_at <= iso(now)) return null
  return { id: row.id, expiresAt: row.expires_at }
}

export function touchSession(db: DatabaseSync, id: string, now: Date = new Date()): void {
  db.prepare(
    'UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?'
  ).run(iso(now), iso(new Date(now.getTime() + SESSION_TTL_MS)), id)
}

export function deleteSession(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(id)
}

export function deleteOtherSessions(db: DatabaseSync, keepId: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE id != ?').run(keepId)
}

// --- Bootstrap (erste Registrierung) ---------------------------------------

export function createBootstrapToken(db: DatabaseSync): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare(
    `INSERT INTO auth_bootstrap (id, token_hash, consumed_at) VALUES (1, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, consumed_at = NULL`
  ).run(hashToken(token))
  return token
}

export function consumeBootstrapToken(db: DatabaseSync, token: string): boolean {
  const row = db
    .prepare('SELECT token_hash, consumed_at FROM auth_bootstrap WHERE id = 1')
    .get() as { token_hash: string | null; consumed_at: string | null } | undefined
  if (!row?.token_hash || row.consumed_at) return false
  if (row.token_hash !== hashToken(token)) return false
  db.prepare('DELETE FROM auth_bootstrap WHERE id = 1').run()
  return true
}

/**
 * Prüft den Setup-Token, ohne ihn zu verbrauchen. Der Token darf mehrfach
 * `register/begin` auslösen — erst ein erfolgreich gespeicherter Passkey
 * beendet die Einrichtung. Sonst macht ein Doppelklick oder ein abgebrochener
 * Face-ID-Dialog den Token unbrauchbar.
 */
export function verifyBootstrapToken(db: DatabaseSync, token: string): boolean {
  const row = db
    .prepare('SELECT token_hash, consumed_at FROM auth_bootstrap WHERE id = 1')
    .get() as { token_hash: string | null; consumed_at: string | null } | undefined
  if (!row?.token_hash || row.consumed_at) return false
  return row.token_hash === hashToken(token)
}

/** Beendet die Einrichtung endgültig (erster Passkey gespeichert). */
export function clearBootstrap(db: DatabaseSync): void {
  db.prepare('DELETE FROM auth_bootstrap WHERE id = 1').run()
}

export function hasCredentials(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM auth_credentials').get() as { c: number }
  return row.c > 0
}

// --- Recovery-Codes ---------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomCode(): string {
  const bytes = randomBytes(16)
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
  return [chars.slice(0, 4).join(''), chars.slice(4, 8).join(''), chars.slice(8, 12).join(''), chars.slice(12, 16).join('')].join('-')
}

/** Erzeugt Klartext-Codes (nur einmal sichtbar) und speichert Argon2id-Hashes. */
export async function createRecoveryCodes(db: DatabaseSync, count = 10): Promise<string[]> {
  const codes: string[] = []
  const insert = db.prepare('INSERT INTO auth_recovery (code_hash) VALUES (?)')
  for (let i = 0; i < count; i++) {
    const code = randomCode()
    codes.push(code)
    insert.run(await argonHash(code))
  }
  return codes
}

export async function consumeRecoveryCode(db: DatabaseSync, code: string): Promise<boolean> {
  const rows = db
    .prepare('SELECT id, code_hash FROM auth_recovery WHERE used_at IS NULL')
    .all() as Array<{ id: number; code_hash: string }>
  const normalized = code.trim().toUpperCase()
  for (const row of rows) {
    if (await argonVerify(row.code_hash, normalized)) {
      db.prepare("UPDATE auth_recovery SET used_at = datetime('now') WHERE id = ?").run(row.id)
      return true
    }
  }
  return false
}

// --- Credentials ------------------------------------------------------------

export interface CredentialRow {
  id: string
  publicKey: Uint8Array
  counter: number
  transports: string | null
  label: string
}

export function listCredentials(db: DatabaseSync): CredentialRow[] {
  const rows = db
    .prepare('SELECT id, public_key, counter, transports, label FROM auth_credentials ORDER BY created_at')
    .all() as Array<{ id: string; public_key: Uint8Array; counter: number; transports: string | null; label: string }>
  return rows.map((row) => ({
    id: row.id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports,
    label: row.label,
  }))
}

export function saveCredential(
  db: DatabaseSync,
  credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string | null; label?: string }
): void {
  db.prepare(
    `INSERT INTO auth_credentials (id, public_key, counter, transports, label)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, counter = excluded.counter`
  ).run(
    credential.id,
    credential.publicKey,
    credential.counter,
    credential.transports ?? null,
    credential.label ?? ''
  )
}

export function updateCredentialCounter(db: DatabaseSync, id: string, counter: number): void {
  db.prepare("UPDATE auth_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?").run(counter, id)
}

export function deleteAllCredentials(db: DatabaseSync): void {
  db.exec('DELETE FROM auth_credentials')
}
