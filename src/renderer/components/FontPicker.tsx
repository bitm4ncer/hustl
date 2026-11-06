import { useEffect, useMemo, useState } from 'react'
import type { TemplateFontSource } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../i18n'

type DownloadableSource = Extract<TemplateFontSource, 'google' | 'fontshare'>
interface Entry { family: string; source: DownloadableSource }

export function FontPicker({
  current, onPicked,
}: {
  current: string
  onPicked: (family: string, source: TemplateFontSource, fontFiles: { weight: number; path: string }[]) => void
}): React.ReactElement {
  const [all, setAll] = useState<Entry[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | DownloadableSource>('all')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void api.listTemplateFonts().then((c) =>
      setAll([
        ...c.google.map((g) => ({ family: g.family, source: 'google' as const })),
        ...c.fontshare.map((f) => ({ family: f.family, source: 'fontshare' as const })),
      ]),
    )
  }, [])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((e) => (filter === 'all' ? true : e.source === filter))
      .filter((e) => (needle ? e.family.toLowerCase().includes(needle) : true))
      .slice(0, 60)
  }, [all, q, filter])

  const pick = async (e: Entry): Promise<void> => {
    setLoading(e.family)
    setError('')
    try {
      const r = await api.downloadTemplateFont(e.family, e.source)
      onPicked(r.family, r.source, r.fontFiles)
    } catch {
      setError(t.template.fontError)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.template.fontSearch}
          className="w-full rounded-[10px] px-3 py-2 text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ background: 'var(--field)', color: 'var(--text)' }}
        />
        {(['all', 'google', 'fontshare'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className="rounded-[10px] px-3 py-2 text-xs focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: filter === s ? 'var(--surface)' : 'var(--field)', color: 'var(--text)' }}
          >
            {s === 'all' ? t.template.fontAll : s === 'google' ? 'GF' : 'FS'}
          </button>
        ))}
      </div>
      {error && <span className="text-xs" style={{ color: 'var(--accent)' }}>{error}</span>}
      <div className="max-h-64 overflow-y-auto rounded-[10px]" style={{ background: 'var(--field)' }}>
        {results.map((e) => (
          <button
            key={`${e.source}:${e.family}`}
            type="button"
            onClick={() => void pick(e)}
            disabled={loading !== null}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ color: 'var(--text)', background: e.family === current ? 'var(--surface)' : 'transparent' }}
          >
            <span>{e.family}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {loading === e.family ? '⬇…' : e.source === 'google' ? 'GF' : 'FS'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
