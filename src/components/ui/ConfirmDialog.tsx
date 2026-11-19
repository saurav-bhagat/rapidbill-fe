import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Focus lands on the confirm button, so Enter confirms and Esc cancels. */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="420px"
      footer={
        <>
          <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-base text-ink-600">{children}</div>
    </Modal>
  )
}
