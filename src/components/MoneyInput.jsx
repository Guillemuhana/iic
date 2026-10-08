import { useEffect, useRef, useState } from 'react';
import { Field } from './ui';

const split = value => value == null ? ['', '00'] : Number(value).toFixed(2).split('.');

/** Mobile amounts: no thousands/decimal separator can silently change the scale. */
export default function MoneyInput({ label, value, onChange, flag }) {
  const [parts, setParts] = useState(() => split(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setParts(split(value)); }, [value]);
  const valid = /^\d{0,12}$/.test(parts[0]) && /^\d{0,2}$/.test(parts[1]);
  const edit = (index, text) => {
    const next = parts.map((p, i) => i === index ? text : p);
    setParts(next);
    const valid = /^\d{1,12}$/.test(next[0]) && /^\d{0,2}$/.test(next[1]);
    onChange(valid ? Number(next[0]) + Number(next[1] || 0) / 100 : null);
  };
  return <fieldset className="min-w-0">
    <legend className="mb-2 text-sm font-semibold text-petrol">{label}</legend>
    <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
      <Field label="Pesos" flag={flag}>
        <input className="field h-14 text-right tabular-nums" inputMode="numeric" aria-label={`${label} en pesos`}
          value={parts[0]} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }}
          onChange={e => edit(0, e.target.value)} placeholder="152034" data-flag={!valid ? 'error' : flag?.level} />
      </Field>
      <Field label="Centavos">
        <input className="field h-14 text-right tabular-nums" inputMode="numeric" aria-label={`${label} en centavos`}
          value={parts[1]} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }} onChange={e => edit(1, e.target.value)} />
      </Field>
    </div>
    <p className="mt-2 text-xs text-slate">Pesos sin puntos ni comas. Ejemplo: 152034 pesos y 00 centavos = $152.034,00.</p>
    {!valid && <p role="alert" className="mt-1 text-sm text-lesion">Ingresá solo números. Los centavos van en su casilla.</p>}
  </fieldset>;
}
