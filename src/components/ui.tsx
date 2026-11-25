import { useEffect, useRef, type ReactNode } from 'react';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (
    ['done', 'approved', 'passed', 'active', 'conducted', 'present', 'ok', 'accepted', 'ready'].includes(
      s,
    )
  ) {
    return 'good';
  }
  if (
    ['warn', 'warning', 'attention', 'late', 'sent', 'pending', 'running_low', 'in_progress'].includes(
      s,
    )
  ) {
    return 'warn';
  }
  if (['failed', 'absent', 'declined', 'returned', 'rejected', 'bad', 'deactivated'].includes(s)) {
    return 'bad';
  }
  return 'neutral';
}

export function Wordmark({
  dark = false,
  assist = false,
}: {
  dark?: boolean;
  assist?: boolean;
}) {
  return (
    <span className={`xe-wordmark ${dark ? 'xe-wordmark--dark' : ''}`}>
      <span>Xe</span>
      <span className="xe-wordmark-io">IO</span>
      {assist ? <span>&nbsp;Assist</span> : null}
    </span>
  );
}

export function Elzeo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`xe-elzeo ${dark ? 'xe-elzeo--dark' : ''}`} aria-label="elzeo">
      elzeo
    </span>
  );
}

export function Card({
  title,
  actions,
  noPadding = false,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  noPadding?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="xe-card">
      {title || actions ? (
        <header className="xe-card-head">
          {title ? <h2 className="xe-card-title">{title}</h2> : <span />}
          {actions ? <div>{actions}</div> : null}
        </header>
      ) : null}
      <div className={noPadding ? 'xe-card-body--flush' : 'xe-card-body'}>{children}</div>
    </section>
  );
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`xe-chip xe-chip--${tone}`}>{children}</span>;
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'ok' | 'err' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={`xe-banner xe-banner--${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="xe-seg" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`xe-seg-btn ${opt.value === value ? 'xe-seg-btn--active' : ''}`}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  lead,
  actions,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="xe-page-head">
      <div>
        {kicker ? <div className="xe-kicker">{kicker}</div> : null}
        <h1 className="xe-page-title">{title}</h1>
        {lead ? <p className="xe-page-lead">{lead}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <div className="xe-empty">{message}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="xe-loading" role="status">
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <Banner tone="err">{message}</Banner>;
}

export interface StepItem {
  id: string;
  label: string;
  locked?: boolean;
  done?: boolean;
}

export function Stepper({
  steps,
  activeId,
  onSelect,
}: {
  steps: StepItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="xe-stepper" aria-label="Stages">
      {steps.map((step, idx) => {
        const active = step.id === activeId;
        const locked = Boolean(step.locked);
        return (
          <button
            key={step.id}
            type="button"
            disabled={locked}
            className={`xe-step-btn ${active ? 'xe-step-btn--active' : ''} ${
              locked ? 'xe-step-btn--locked' : ''
            }`}
            onClick={() => {
              if (!locked) onSelect(step.id);
            }}
          >
            <span className="xe-mono">{idx + 1}.</span>
            <span>{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    box?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && box) {
        const focusables = box.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prevFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="xe-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        className="xe-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="xe-card-head">
          <h2 className="xe-card-title">{title}</h2>
          <button type="button" className="xe-btn" aria-label="Close modal" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="xe-card-body">{children}</div>
      </div>
    </div>
  );
}

export function Bar({
  value,
  target,
  label,
}: {
  value: number;
  target?: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const below = target !== undefined && clamped < target;
  return (
    <div
      className="xe-bar-track"
      role="img"
      aria-label={`${label}: ${clamped}%${target !== undefined ? ` (target ${target}%)` : ''}`}
    >
      <div
        className={`xe-bar-fill ${below ? 'xe-bar-fill--warn' : ''}`}
        style={{ width: `${clamped}%` }}
      />
      {target !== undefined ? (
        <div className="xe-bar-target" style={{ left: `${Math.max(0, Math.min(100, target))}%` }} />
      ) : null}
    </div>
  );
}

export function Kpis({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="xe-kpis">
      {items.map((item) => (
        <div key={item.label} className="xe-kpi">
          <div className="xe-kpi-label">{item.label}</div>
          <div className="xe-kpi-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
