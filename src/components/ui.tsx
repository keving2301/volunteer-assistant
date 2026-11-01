import { useEffect, useId, useRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { useModalDialog } from '../lib/motion'
import { Icon, type IconName } from './Icon'

// Dialog: the native <dialog> element opened with showModal(), so focus is trapped, Escape closes it, and the rest of
// the page is inert while it is open. On phones it fills the screen and its body scrolls on its own. While it closes,
// it keeps showing what it showed last, so the exit animation never runs on an empty box.

export function Dialog(props: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Closing by clicking outside loses typed input, so forms leave it off. */
  closeOnBackdrop?: boolean
}) {
  const { open, onClose, title, description, children, footer, size = 'md', closeOnBackdrop = false } = props
  const ref = useRef<HTMLDialogElement>(null)
  const pressedOnBackdrop = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const { present, closing } = useModalDialog(open, ref)
  const last = useRef({ title, description, children, footer })
  if (open) last.current = { title, description, children, footer }
  const shown = last.current

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}${closing ? ' is-closing' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === ref.current
      }}
      onClick={(event) => {
        if (closeOnBackdrop && pressedOnBackdrop.current && event.target === ref.current) onClose()
      }}
    >
      {present && (
        <div className="dialog-panel">
          <header className="dialog-header">
            <div>
              <h2 id={titleId} className="dialog-title">
                {shown.title}
              </h2>
              {shown.description && (
                <p id={descriptionId} className="dialog-description">
                  {shown.description}
                </p>
              )}
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          <div className="dialog-body">{shown.children}</div>
          {shown.footer && <footer className="dialog-footer">{shown.footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog(props: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="sm"
      closeOnBackdrop
      footer={
        <>
          <button type="button" className="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? 'Deleting...' : props.confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-text">{props.children}</div>
      {props.error && <InlineError>{props.error}</InlineError>}
    </Dialog>
  )
}

// Form fields. Each one wires its label, hint and error to the control for screen readers.

interface FieldShell {
  label: string
  error?: string
  hint?: ReactNode
  className?: string
}

export function TextField({ label, error, hint, className, ...input }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...input}
      />
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...select
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="select">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...select}
        >
          {children}
        </select>
        <Icon name="chevronDown" size={16} className="select-chevron" />
      </div>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-danger" role="alert">
      <Icon name="alert" size={16} />
      <div>{children}</div>
    </div>
  )
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warn' | 'danger'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`}>
      <Icon name={icon ?? (tone === 'info' ? 'info' : 'alert')} size={16} />
      <div>{children}</div>
    </div>
  )
}

// Page states

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}...</span>
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <Icon name="alert" />
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3 className="empty-title">{title}</h3>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  meta,
  actions,
  back,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} | Code Outreach`
  }, [title])
  return (
    <header className="page-header">
      {back}
      <div className="page-header-row">
        <div className="page-heading">
          <h1 className="page-title">{title}</h1>
          <div className="page-meta">{meta ?? '\u00a0'}</div>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  )
}
