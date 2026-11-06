import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('deployment', () => {
  const dockerfile = readFileSync('deploy/Dockerfile', 'utf8')
  const compose = readFileSync('deploy/selfhost/compose.bundled.yml', 'utf8')
  const hustl = compose.slice(compose.indexOf('  hustl:'), compose.indexOf('  caddy:'))

  it('uses node 24 and installs chromium', () => {
    expect(dockerfile).toMatch(/FROM node:24/)
    expect(dockerfile).toMatch(/chromium/)
  })

  it('does not publish a port for the app container', () => {
    expect(hustl).not.toMatch(/^\s+ports:/m)
  })

  it('hardens the app container', () => {
    expect(hustl).toMatch(/read_only:\s*true/)
    expect(hustl).toMatch(/no-new-privileges/)
    expect(hustl).toMatch(/mem_limit/)
    expect(hustl).toMatch(/TZ:\s*\$\{TZ:-Europe\/Berlin\}/)
  })
})
