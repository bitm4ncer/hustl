import path from 'node:path'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { loadConfig } from './config'
import { importLegacy } from './migrate/legacy-import'
import { closeDatabase, initDatabase } from '../core/db/connection'
import { createBootstrapToken, deleteAllCredentials } from './auth/store'
import { todayInBerlin } from '../core/clock'

function flags(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      result[key] = next
      index += 1
    } else {
      result[key] = 'true'
    }
  }
  return result
}

function writeBootstrap(dataDir: string): void {
  const db = initDatabase(dataDir)
  const token = createBootstrapToken(db)
  mkdirSync(dataDir, { recursive: true })
  const file = path.join(dataDir, 'bootstrap-token.txt')
  writeFileSync(file, token + '\n', { mode: 0o600 })
  // eslint-disable-next-line no-console
  console.log(`Bootstrap-Token geschrieben: ${file}`)
  closeDatabase()
}

async function snapshot(dataDir: string): Promise<void> {
  const db = initDatabase(dataDir)
  const dir = path.join(dataDir, 'backups')
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, `hustl-${todayInBerlin()}.db`)
  await fs.rm(target, { force: true })
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  closeDatabase()

  const files = readdirSync(dir)
    .filter((name) => /^hustl-\d{4}-\d{2}-\d{2}\.db$/.test(name))
    .sort()
  for (const stale of files.slice(0, Math.max(0, files.length - 7))) {
    rmSync(path.join(dir, stale), { force: true })
  }
  // eslint-disable-next-line no-console
  console.log(`Snapshot: ${target}`)
}

function walkFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(absolute))
    else if (entry.isFile()) out.push(absolute)
  }
  return out
}

async function cleanup(dataDir: string, olderThanDays: number): Promise<void> {
  const db = initDatabase(dataDir)
  const referenced = new Set<string>()
  for (const [table, column] of [
    ['invoices', 'pdf_path'],
    ['offers', 'pdf_path'],
    ['expenses', 'pdf_path'],
    ['bank_statements', 'pdf_path'],
  ] as Array<[string, string]>) {
    const rows = db.prepare(`SELECT ${column} AS stored FROM ${table} WHERE ${column} IS NOT NULL`).all() as Array<{
      stored: string
    }>
    for (const row of rows) referenced.add(row.stored.split(/[\\/]/).join('/'))
  }
  const template = db.prepare('SELECT data FROM invoice_template WHERE id = 1').get() as
    | { data: string }
    | undefined
  if (template) {
    const data = JSON.parse(template.data) as { logoPath?: string; fontFiles?: Array<{ path?: string }> }
    if (data.logoPath) referenced.add(data.logoPath.split(/[\\/]/).join('/'))
    for (const file of data.fontFiles ?? []) {
      if (file.path) referenced.add(file.path.split(/[\\/]/).join('/'))
    }
  }
  closeDatabase()

  const cutoff = Date.now() - olderThanDays * 24 * 3600_000
  let removed = 0
  for (const dir of ['invoices', 'offers', 'expenses', 'statements']) {
    const root = path.join(dataDir, dir)
    if (!existsSync(root)) continue
    for (const absolute of walkFiles(root)) {
      const relative = path.relative(dataDir, absolute).split(path.sep).join('/')
      if (referenced.has(relative)) continue
      if (statSync(absolute).mtimeMs > cutoff) continue
      await fs.rm(absolute, { force: true })
      removed += 1
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Aufgeräumt: ${removed} verwaiste Dateien`)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const args = flags(rest)
  const config = loadConfig(process.env)

  switch (command) {
    case 'import': {
      const report = await importLegacy({
        dbFile: args.db,
        sourceDir: args.from,
        oldRoot: args['old-root'],
        targetDir: args.to ?? config.dataDir,
      })
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(report, null, 2))
      return
    }
    case 'reset-auth': {
      const db = initDatabase(config.dataDir)
      deleteAllCredentials(db)
      db.exec('DELETE FROM auth_sessions')
      db.exec('DELETE FROM auth_recovery')
      closeDatabase()
      writeBootstrap(config.dataDir)
      return
    }
    case 'bootstrap': {
      writeBootstrap(config.dataDir)
      return
    }
    case 'snapshot': {
      await snapshot(config.dataDir)
      return
    }
    case 'cleanup': {
      await cleanup(config.dataDir, Number(args['older-than'] ?? 30))
      return
    }
    default:
      // eslint-disable-next-line no-console
      console.error(
        'Verwendung: cli.js <import|reset-auth|bootstrap|snapshot|cleanup> [--flags]'
      )
      process.exit(2)
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
