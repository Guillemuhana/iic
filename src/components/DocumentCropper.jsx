import { useRef, useState } from 'react';
import { Button } from './ui';

// Cropping is local; the original is never uploaded to Storage.
export default function DocumentCropper({ src, onApply, amount = false }) {
  const image = useRef(null);
  const origin = useRef(null);
  const [box, setBox] = useState({ x: .05, y: .05, w: .9, h: .9 });
  const [busy, setBusy] = useState(false);
  const point = (e) => {
    const r = image.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  const move = (e) => {
    if (!origin.current) return;
    const p = point(e), o = origin.current;
    setBox({ x: Math.min(p.x, o.x), y: Math.min(p.y, o.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) });
  };
  const apply = async () => {
    setBusy(true);
    try {
      const img = image.current;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(box.w * img.naturalWidth));
      canvas.height = Math.max(1, Math.round(box.h * img.naturalHeight));
      canvas.getContext('2d').drawImage(img, box.x * img.naturalWidth, box.y * img.naturalHeight, box.w * img.naturalWidth, box.h * img.naturalHeight, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .95));
      if (blob) await onApply(blob);
    } finally { setBusy(false); }
  };
  return <div>
    <p className="mb-4 text-sm text-slate">{amount ? 'Seleccioná toda la línea del importe, incluyendo “Recibí la suma de” o la etiqueta de la transferencia. Si hay =, incluí ambos lados. No incluyas el total del ticket adjunto.' : 'Arrastrá sobre la foto para seleccionar el documento completo. Incluí el monto, la fecha, las casillas y la aclaración.'}</p>
    <div className="relative touch-none select-none overflow-hidden rounded-xl"
      onPointerDown={(e) => { origin.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={move} onPointerUp={() => { origin.current = null; }} onPointerCancel={() => { origin.current = null; }}>
      <img ref={image} src={src} alt="Seleccionar el documento a leer" className="block w-full" draggable={false} />
      <div className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(18,58,90,.55)]"
        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />
    </div>
    <Button className="mt-4 w-full" disabled={box.w < .1 || box.h < .025} loading={busy} onClick={apply}>{amount ? 'Volver a leer este importe' : 'Usar este encuadre'}</Button>
  </div>;
}
