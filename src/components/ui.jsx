import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import logoFull from '../assets/logo01.png';
import logoMono from '../assets/logo-iic-mono.png';
import logoMonoWhite from '../assets/logo-iic-mono-blanco.png';

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

export function cx(...a) { return a.filter(Boolean).join(' '); }

export function Button({ variant = 'primary', size = 'md', loading, className, children, icon: Icon, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-14 px-6 text-base', xl: 'h-16 px-7 text-lg' };
  const variants = {
    primary: 'bg-petrol text-white hover:bg-petrol-2 active:bg-petrol-3',
    accent: 'bg-saline text-white hover:bg-saline-dark hover:text-white',
    ghost: 'bg-transparent text-ink hover:bg-fog',
    outline: 'border border-mist bg-white text-ink hover:border-petrol-3',
    danger: 'bg-lesion text-white hover:opacity-90',
    light: 'bg-white/10 text-white hover:bg-white/20',
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-[18px]" strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, flag, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-slate">
        {label}
        {flag && <span className={cx('text-[12px] font-medium', flag.level === 'error' ? 'text-lesion' : 'text-iodine')}>{flag.short || 'Revisar'}</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-slate">{hint}</span>}
      {flag?.message && <span className={cx('mt-1 block text-[12px]', flag.level === 'error' ? 'text-lesion' : 'text-iodine')}>{flag.message}</span>}
    </label>
  );
}

export function Card({ className, children, ...p }) {
  return <div className={cx('surface rounded-2xl', className)} {...p}>{children}</div>;
}

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-fog text-slate',
    ok: 'bg-saline/15 text-saline-dark',
    warn: 'bg-iodine-soft text-iodine',
    error: 'bg-lesion-soft text-lesion',
    petrol: 'bg-petrol text-white',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', tones[tone], className)}>{children}</span>;
}

export const STATUS = {
  cargado: { label: 'Se envía el viernes a las 12 h', short: 'Por enviar', tone: 'warn' },
  enviado: { label: 'Enviado a contadora', short: 'Enviado', tone: 'ok' },
  anulado: { label: 'Anulado', short: 'Anulado', tone: 'error' },
};

export function StatusBadge({ status, short }) {
  const s = STATUS[status] || STATUS.cargado;
  return <Badge tone={s.tone}>{short ? s.short : s.label}</Badge>;
}

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-petrol-3', className)} />;
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-petrol/40 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-5xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mist px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate hover:bg-fog" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-mist px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-fog text-petrol-3"><Icon className="size-7" /></div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const icons = { ok: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:bottom-6 sm:top-auto sm:items-end sm:pr-6" aria-live="polite">
        {items.map((t) => {
          const Icon = icons[t.tone] || Info;
          return (
            <div key={t.id} className={cx('pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
              t.tone === 'error' ? 'bg-lesion text-white' : 'bg-petrol text-white')}>
              <Icon className={cx('mt-0.5 size-4 shrink-0', t.tone === 'ok' && 'text-saline')} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/**
 * Logo del Instituto. `light` = versión blanca para fondos oscuros.
 * `compact` = solo el monograma. `full` = logo completo con nombre.
 */
export function Logo({ light, compact, full, className }) {
  if (full) {
    return <img src={logoFull} alt="Instituto de Investigaciones Clínicas · Córdoba" className={cx('h-auto w-44 object-contain', light && 'rounded-lg bg-white p-2', className)} />;
  }
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <img src={light ? logoMonoWhite : logoMono} alt="IIC" className="h-9 w-auto shrink-0" />
      {!compact && (
        <div className={cx('border-l pl-3 leading-tight', light ? 'border-white/25' : 'border-mist')}>
          <div className={cx('flex items-center gap-1.5 text-[14px] font-bold', light ? 'text-white' : 'text-petrol')}>
            Comprobantes
            {IS_DEMO && <span className={cx('rounded px-1.5 text-[10px] font-bold', light ? 'bg-saline text-white' : 'bg-petrol text-white')}>DEMO</span>}
          </div>
          <div className={cx('text-[11px]', light ? 'text-white/60' : 'text-slate')}>Investigaciones Clínicas · Córdoba</div>
        </div>
      )}
    </div>
  );
}

/**
 * Encabezado institucional: monograma + "Instituto de Investigaciones Clínicas de Córdoba".
 * `light` para fondos oscuros. `section` agrega el nombre de la pantalla debajo.
 */
export function InstituteMark({ light, section, className, small }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-3', className)}>
      <div className="min-w-0 leading-tight">
        <img src={logoFull} alt="Instituto de Investigaciones Clínicas de Córdoba"
          className={cx('h-auto max-w-full object-contain', small ? 'w-52' : 'w-64', light && 'rounded-lg bg-white px-3 py-2')} />
        {(section || IS_DEMO) && (
          <p className={cx('mt-0.5 flex items-center gap-1.5 text-[11.5px]', light ? 'text-white/60' : 'text-slate')}>
            {section}
            {IS_DEMO && <span className={cx('rounded px-1.5 text-[10px] font-bold', light ? 'bg-saline text-white' : 'bg-petrol text-white')}>DEMO</span>}
          </p>
        )}
      </div>
    </div>
  );
}
