import { useRef, useState } from 'react';
import { Plus, X, ShieldCheck, EyeOff } from 'lucide-react';
import { cx } from './ui';
import { TIPOS_DATO } from '../../shared/ticket-rules.js';

/**
 * Muestra la foto con las tapas sobre los datos personales.
 * Se pueden mover (arrastrar), achicar/agrandar (esquina) y quitar.
 * Las cajas usan coordenadas 0–1 de la imagen.
 */
export default function RedactionEditor({ src, boxes, onChange, className }) {
  const wrap = useRef(null);
  const drag = useRef(null);
  const [active, setActive] = useState(null);

  const toRel = (e) => {
    const r = wrap.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const start = (e, i, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActive(i);
    drag.current = { i, mode, p0: toRel(e), b0: { ...boxes[i] } };
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = toRel(e);
    const dx = p.x - d.p0.x;
    const dy = p.y - d.p0.y;
    const b = { ...d.b0 };
    if (d.mode === 'move') {
      b.x = clamp(d.b0.x + dx, 0, 1 - b.w);
      b.y = clamp(d.b0.y + dy, 0, 1 - b.h);
    } else {
      b.w = clamp(d.b0.w + dx, 0.03, 1 - b.x);
      b.h = clamp(d.b0.h + dy, 0.015, 1 - b.y);
    }
    onChange(boxes.map((x, j) => (j === d.i ? b : x)));
  };

  const end = () => { drag.current = null; };

  const add = () => {
    onChange([...boxes, { x: 0.3, y: 0.42, w: 0.4, h: 0.08, tipo: 'otro', manual: true }]);
    setActive(boxes.length);
  };

  return (
    <div className={className}>
      <div ref={wrap} className="relative select-none overflow-hidden rounded-2xl border border-mist bg-fog touch-none"
        onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={() => setActive(null)}>
        <img src={src} alt="Foto del comprobante" className="block w-full" draggable={false} />
        {boxes.map((b, i) => (
          <div key={i}
            onPointerDown={(e) => start(e, i, 'move')}
            className={cx('absolute cursor-move rounded-[3px] bg-petrol/95 ring-2', active === i ? 'ring-saline' : 'ring-white/70')}
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`,
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.14) 0 6px, transparent 6px 18px)' }}>
            {b.h > 0.04 && b.w > 0.12 && (
              <span className="pointer-events-none absolute left-1 top-0.5 max-w-full truncate text-[10px] font-semibold text-white/90">
                {TIPOS_DATO[b.tipo] || 'Dato personal'}
              </span>
            )}
            <button type="button" aria-label="Quitar tapa"
              onPointerDown={(e) => { e.stopPropagation(); onChange(boxes.filter((_, j) => j !== i)); }}
              className="absolute -right-2.5 -top-2.5 grid size-6 place-items-center rounded-full bg-white text-lesion shadow">
              <X className="size-3.5" strokeWidth={3} />
            </button>
            <span onPointerDown={(e) => start(e, i, 'resize')} aria-hidden
              className="absolute -bottom-2 -right-2 size-5 cursor-nwse-resize rounded-full border-2 border-white bg-saline" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-xl border border-mist bg-white px-3 py-2 text-sm font-semibold hover:border-petrol-3">
          <Plus className="size-4" /> Tapar otro dato
        </button>
        <p className="inline-flex items-center gap-1.5 text-[13px] text-slate">
          {boxes.length ? <ShieldCheck className="size-4 text-saline-dark" /> : <EyeOff className="size-4 text-iodine" />}
          {boxes.length
            ? `${boxes.length} dato${boxes.length === 1 ? '' : 's'} tapado${boxes.length === 1 ? '' : 's'}. Arrastrá para ajustar.`
            : 'No se detectaron datos personales. Revisá la foto.'}
        </p>
      </div>
    </div>
  );
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
