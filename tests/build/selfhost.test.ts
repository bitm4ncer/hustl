import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('self-host assets', () => {
  it('installer ist sicher und generisch', () => {
    const install = read('deploy/selfhost/install.sh')
    expect(install).toMatch(/set -euo pipefail/)
    expect(install).toMatch(/HUSTL_DOMAIN/)
    expect(install).toMatch(/HUSTL_PROXY/)
    expect(install).toMatch(/docker compose up -d/)
    expect(install).toMatch(/bootstrap-token\.txt/)
    expect(install).toMatch(/Caddyfile\.docker\.snippet/)
    expect(install).toMatch(/PROXY_NETWORK/)
    expect(install).not.toMatch(/bitmancer\.net/)
    // Kein blindes Löschen der Nutzdaten.
    expect(install).not.toMatch(/rm -rf\s+\/?\$\{?INSTALL_DIR/)
  })

  it('bundled stack bringt Caddy mit und veroeffentlicht keinen Hustl-Port', () => {
    const compose = read('deploy/selfhost/compose.bundled.yml')
    expect(compose).toMatch(/image: caddy:/)
    expect(compose).toMatch(/443:443/)
    expect(compose).toMatch(/read_only:\s*true/)
    expect(compose).toMatch(/no-new-privileges/)
    expect(compose).not.toMatch(/HUSTL_DOMAIN:\s*hustl\./)
    const hustlBlock = compose.slice(compose.indexOf('  hustl:'), compose.indexOf('  caddy:'))
    expect(hustlBlock).not.toMatch(/^\s+ports:/m)
  })

  it('external stack bindet nur an localhost und nutzt ein proxy-netz', () => {
    const compose = read('deploy/selfhost/compose.external.yml')
    expect(compose).toMatch(/127\.0\.0\.1:/)
    expect(compose).not.toMatch(/0\.0\.0\.0:/)
    expect(compose).toMatch(/PROXY_NETWORK/)
    expect(compose).toMatch(/external:\s*true/)
  })

  it('caddy nutzt domain und acme aus der umgebung', () => {
    const caddy = read('deploy/selfhost/Caddyfile.template')
    expect(caddy).toMatch(/\{\$HUSTL_DOMAIN\}/)
    expect(caddy).toMatch(/\{\$ACME_EMAIL\}/)
    expect(caddy).toMatch(/reverse_proxy hustl:3000/)
  })

  it('backup und restore sind vorhanden', () => {
    const backup = read('deploy/selfhost/backup.sh')
    const restore = read('deploy/selfhost/restore.sh')
    expect(backup).toMatch(/cli\.mjs snapshot/)
    expect(backup).toMatch(/restic backup/)
    expect(restore).toMatch(/integrity_check/)
    expect(restore).toMatch(/--check/)
  })
})

describe('readme und agent prompt', () => {
  it('readme hat den radioDock-artigen header und die install-wege', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/<p align="center">/)
    expect(readme).toMatch(/resources\/icon\.png/)
    expect(readme).toMatch(/img\.shields\.io/)
    expect(readme).toMatch(/deploy\/selfhost\/install\.sh/)
    expect(readme).toMatch(/INSTALL-WITH-AGENT\.md/)
    expect(readme).toMatch(/releases\/latest/)
    expect(readme).toMatch(/dist:mac/)
    expect(readme).not.toMatch(/bitmancer\.net/)
  })

  it('agent prompt enthaelt fragenkatalog, schutzregeln und reset', () => {
    const agent = read('INSTALL-WITH-AGENT.md')
    expect(agent).toMatch(/FRAGENKATALOG/)
    expect(agent).toMatch(/Hast du bereits einen VPS/)
    expect(agent).toMatch(/SSH/)
    expect(agent).toMatch(/Cloudflare/)
    expect(agent).toMatch(/reset-auth/)
    expect(agent).toMatch(/destruktiven Schritten/)
    expect(agent).toMatch(/Keine Secrets/)
  })
})

describe('lokale installer', () => {
  it('macOS-target und script sind konfiguriert', () => {
    const builder = read('electron-builder.yml')
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    expect(builder).toMatch(/^mac:/m)
    expect(builder).toMatch(/dmg/)
    expect(builder).toMatch(/arm64/)
    expect(builder).toMatch(/x64/)
    expect(pkg.scripts['dist:mac']).toMatch(/electron-builder --mac/)
  })

  it('release-workflow baut windows, macos und linux', () => {
    const workflow = read('.github/workflows/release.yml')
    expect(workflow).toMatch(/windows-latest/)
    expect(workflow).toMatch(/macos-latest/)
    expect(workflow).toMatch(/ubuntu-latest/)
    expect(workflow).toMatch(/dist:win/)
    expect(workflow).toMatch(/dist:mac/)
    expect(workflow).toMatch(/dist:linux/)
  })
})
