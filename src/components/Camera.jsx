import { useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, ImageUp } from 'lucide-react';

/**
 * Visor de cámara a pantalla completa con guía en forma de ticket.
 * Usa la cámara trasera en la máxima resolución disponible y, si no hay permiso,
 * cae al selector nativo del teléfono (input capture).
 */
export default function Camera({ onCapture, onClose, hint = 'Encuadrá el documento completo' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara en vivo. Usá "Elegir foto".');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        setTorchAvailable(Boolean(caps.torch));
        if (caps.focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e) {
        setError(e?.name === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Habilitalo en el navegador o usá "Elegir foto".'
          : 'No se pudo abrir la cámara. Usá "Elegir foto".');
      }
    }
    start();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch { setTorchAvailable(false); }
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !ready) return;
    const track = streamRef.current?.getVideoTracks()[0];
    // ImageCapture da la foto a resolución completa del sensor cuando existe (Android/Chrome)
    if (track && 'ImageCapture' in window) {
      try {
        const blob = await new window.ImageCapture(track).takePhoto();
        streamRef.current.getTracks().forEach((t) => t.stop());
        return onCapture(blob);
      } catch { /* sigue con el frame de video */ }
    }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(c);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) { streamRef.current?.getTracks().forEach((t) => t.stop()); onCapture(f); }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#06161C] text-white">
      <div className="safe-top flex items-center justify-between px-4 pb-3">
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Cerrar cámara"><X /></button>
        <p className="px-2 text-center text-sm font-medium text-white/80">{hint}</p>
        {torchAvailable ? (
          <button onClick={toggleTorch} className="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Linterna">
            {torch ? <Zap className="text-saline" /> : <ZapOff />}
          </button>
        ) : <span className="size-11" />}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="viewfinder-mask relative h-[78%] w-[62%] max-w-sm rounded-[18px] border-2 border-white/90">
              {['-left-0.5 -top-0.5 border-l-4 border-t-4 rounded-tl-[18px]', '-right-0.5 -top-0.5 border-r-4 border-t-4 rounded-tr-[18px]',
                '-left-0.5 -bottom-0.5 border-l-4 border-b-4 rounded-bl-[18px]', '-right-0.5 -bottom-0.5 border-r-4 border-b-4 rounded-br-[18px]'].map((c) => (
                <span key={c} className={`absolute size-8 border-saline ${c}`} />
              ))}
              <span className="scan-line absolute left-3 right-3 h-0.5 bg-saline/80 shadow-[0_0_12px_2px_rgba(0,101,179,.6)]" />
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <p className="max-w-xs text-white/85">{error}</p>
          </div>
        )}
      </div>

      <div className="safe-bottom px-6 pt-5">
        <ul className="mb-5 space-y-1 text-center text-[13px] text-white/65">
          <li>Papel plano, con buena luz y sin sombras.</li>
          <li>Que se vean el estudio, la visita, el importe y la aclaración.</li>
        </ul>
        <div className="flex items-center justify-between">
          <button onClick={() => fileRef.current?.click()} className="flex w-20 flex-col items-center gap-1 text-xs text-white/80">
            <span className="grid size-12 place-items-center rounded-full bg-white/10"><ImageUp className="size-5" /></span>
            Elegir foto
          </button>
          <button onClick={capture} disabled={!ready} aria-label="Sacar foto"
            className="grid size-20 place-items-center rounded-full border-4 border-white/90 disabled:opacity-40">
            <span className="size-[62px] rounded-full bg-white transition-transform active:scale-90" />
          </button>
          <span className="w-20" />
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}
