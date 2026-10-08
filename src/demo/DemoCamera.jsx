import { X, FileText, ArrowLeftRight, Check } from 'lucide-react';
import recibo from './demo-recibo.jpg';
import transferencia from './demo-transferencia.jpg';

const SAMPLES = [
  { key: 'recibo', tipo: 'recibo_viatico', src: recibo, title: 'Recibo de viáticos', text: 'Con ticket de YPF adjunto. Firma de ejemplo.' },
  { key: 'transferencia', tipo: 'comprobante_transferencia', src: transferencia, title: 'Transferencia de Mercado Pago', text: 'Destinatario con datos de ejemplo.' },
];

/** En la demo no se usa la cámara: se elige una foto de ejemplo (datos inventados). */
export default function DemoCamera({ onCapture, onClose, used = [] }) {
  const pick = async (s) => {
    window.__demoNext = s.key;
    let blob;
    if (s.src.startsWith('data:')) {
      const [head, b64] = s.src.split(',');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: head.slice(5).split(';')[0] });
    } else {
      blob = await (await fetch(s.src)).blob();
    }
    onCapture(blob);
  };
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[#06161C] text-white">
      <div className="safe-top flex items-center justify-between px-4 pb-3">
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Cerrar"><X /></button>
        <p className="text-sm font-medium text-white/80">Elegí qué foto sacar</p>
        <span className="size-11" />
      </div>
      <div className="mx-auto w-full max-w-md flex-1 px-5 pb-8">
        <p className="mb-5 text-[13px] leading-relaxed text-white/65">
          En la app real se abre la cámara del teléfono. En esta demo usamos dos fotos reales del instituto con los datos del paciente reemplazados por datos inventados.
        </p>
        <div className="grid gap-4">
          {SAMPLES.map((s) => {
            const done = used.includes(s.tipo);
            const Icon = s.key === 'recibo' ? FileText : ArrowLeftRight;
            return (
              <button key={s.key} onClick={() => pick(s)}
                className="flex items-center gap-4 rounded-2xl bg-white/[.06] p-3 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10">
                <img src={s.src} alt="" className="h-28 w-20 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-saline" /> {s.title}</span>
                  <span className="mt-1 block text-[13px] text-white/60">{s.text}</span>
                  {done && <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-saline"><Check className="size-3.5" /> Ya agregada</span>}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[12.5px] text-white/50">Sugerencia: primero el recibo, después agregá la transferencia.</p>
      </div>
    </div>
  );
}
