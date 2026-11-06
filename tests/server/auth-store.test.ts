import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../src/core/db/migrations'
import {
  createChallenge,
  consumeChallenge,
  createSession,
  getSession,
  deleteOtherSessions,
  createRecoveryCodes,
  consumeRecoveryCode,
  hashToken,
} from '../../src/server/auth/store'

function db(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  applyMigrations(database)
  return database
}

describe('challenges', () => {
  it('sind einmalig', () => {
    const d = db()
    const c = createChallenge(d, 'login')
    expect(consumeChallenge(d, c.id, 'login')).toBe(c.challenge)
    expect(consumeChallenge(d, c.id, 'login')).toBeNull()
  })

  it('laufen nach 5 Minuten ab', () => {
    const d = db()
    const c = createChallenge(d, 'login')
    const later = new Date(Date.now() + 6 * 60_000)
    expect(consumeChallenge(d, c.id, 'login', later)).toBeNull()
  })
})

describe('sessions', () => {
  it('speichert nur den Hash des Tokens', () => {
    const d = db()
    const s = createSession(d, { userAgent: 'x', ip: '1.2.3.4' })
    const row = d.prepare('SELECT token_hash FROM auth_sessions').get() as { token_hash: string }
    expect(row.token_hash).toBe(hashToken(s.token))
    expect(row.token_hash).not.toBe(s.token)
    expect(getSession(d, s.token)).not.toBeNull()
  })

  it('deleteOtherSessions laesst die aktuelle stehen', () => {
    const d = db()
    const a = createSession(d, { userAgent: null, ip: null })
    createSession(d, { userAgent: null, ip: null })
    deleteOtherSessions(d, a.id)
    expect(d.prepare('SELECT COUNT(*) AS c FROM auth_sessions').get()).toEqual({ c: 1 })
  })

  it('abgelaufene Sessions sind ungueltig', () => {
    const d = db()
    const s = createSession(d, { userAgent: null, ip: null })
    expect(getSession(d, s.token, new Date(Date.now() + 31 * 24 * 3600_000))).toBeNull()
  })
})

describe('recovery codes', () => {
  it('sind einmalig und werden gehasht gespeichert', async () => {
    const d = db()
    const codes = await createRecoveryCodes(d, 3)
    expect(codes).toHaveLength(3)
    expect(await consumeRecoveryCode(d, codes[0])).toBe(true)
    expect(await consumeRecoveryCode(d, codes[0])).toBe(false)
  })

  it('lehnt unbekannte Codes ab', async () => {
    const d = db()
    await createRecoveryCodes(d, 3)
    expect(await consumeRecoveryCode(d, 'AAAA-BBBB-CCCC')).toBe(false)
  })
})
