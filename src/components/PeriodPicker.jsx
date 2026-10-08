import { todayISO, addDays, startOfMonth } from '../lib/format';
import { cx } from './ui';

export function presetRange(key) {
  const today = todayISO();
  switch (key) {
    case 'hoy': return { from: today, to: today };
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'mes': return { from: startOfMonth(today), to: today };
    case 'mes_ant': {
      const first = startOfMonth(today);
      const lastPrev = addDays(first, -1);
      return { from: startOfMonth(lastPrev), to: lastPrev };
    }
    case 'anio': return { from: today.slice(0, 4) + '-01-01', to: today };
    default: return { from: startOfMonth(today), to: today };
  }
}

const PRESETS = [['hoy', 'Hoy'], ['7d', '7 días'], ['mes', 'Este mes'], ['mes_ant', 'Mes anterior'], ['anio', 'Este año']];

export default function PeriodPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-xl border border-mist bg-white p-1">
        {PRESETS.map(([k, label]) => (
          <button key={k} onClick={() => onChange({ preset: k, ...presetRange(k) })}
            className={cx('rounded-lg px-3 py-1.5 text-[13px] font-semibold', value.preset === k ? 'bg-petrol text-white' : 'text-slate hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-mist bg-white px-2 py-1">
        <input type="date" className="bg-transparent px-1 py-1 text-[13px]" value={value.from} max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', from: e.target.value })} aria-label="Desde" />
        <span className="text-slate">a</span>
        <input type="date" className="bg-transparent px-1 py-1 text-[13px]" value={value.to} min={value.from}
          onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', to: e.target.value })} aria-label="Hasta" />
      </div>
    </div>
  );
}
