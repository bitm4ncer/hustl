import { t } from '../i18n'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
  tone?: 'default' | 'danger'
}

/**
 * Bestätigung im App-Stil. Schließt nur bei einer Geste, die komplett auf dem
 * Backdrop liegt (kein versehentliches Verwerfen beim Text-Markieren), per
 * Escape oder über "Abbrechen".
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  tone = 'default',
}: Props): React.ReactElement {
  return (
    <Modal open onClose={onCancel} busy={busy} widthClass="max-w-md">
      <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {title}
      </h2>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {body}
      </p>
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          {t.actions.cancel}
        </Button>
        <Button
          disabled={busy}
          onClick={onConfirm}
          variant={tone === 'danger' ? 'danger' : 'primary'}
        >
          {busy ? t.common.loading : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
