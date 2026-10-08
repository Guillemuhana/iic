import { useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, ImageUp } from 'lucide-react';
import { detectDocument, sameDocument, documentCrop } from '../lib/document-detection';

/**
 * Visor de cámara a pantalla completa con guía en forma de ticket.
 * Usa la cámara trasera en la máxima resolución disponible y, si no hay permiso,
 * cae al selector nativo del teléfono (input capture).
 */
export default function Camera({ onCapture, onClose, hint = 'Encuadrá el documento completo' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const nativeCameraRef = useRef(null);
  const capturedRef = useRef(false);
  const captureRef = useRef(null);
  const [automatic, setAutomatic] = useState(true);
  const [documentBox, setDocumentBox] = useState(null);
  const [progress, setProgress] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 16, height: 9 });
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
        if (cancelled || capturedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        setTorchAvailable(Boolean(caps.torch));
        if (caps.focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        const v = videoRef.current;
        if (!v) { stream.getTracks().forEach((t) => t.stop()); return; }
        v.srcObject = stream;
        await v.play();
        if (cancelled || capturedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        setVideoSize({ width: v.videoWidth, height: v.videoHeight });
        setReady(true);
      } catch (e) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (cancelled || capturedRef.current) return;
        setError(e?.name === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Habilitalo en el navegador o usá "Elegir foto".'
          : 'No se pudo abrir la cámara. Usá "Elegir foto".');
      }
    }
    start();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    if (!ready || !automatic) { setDocumentBox(null); setProgress(0); return; }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let previous = null, anchor = null, stableSince = 0;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (capturedRef.current || !video?.videoWidth || document.hidden) { stableSince = 0; anchor = null; return; }
      const scale = 360 / Math.max(video.videoWidth, video.videoHeight);
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const box = detectDocument(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setDocumentBox(box);
      if (!box?.sharp || !sameDocument(previous, box) || !sameDocument(anchor, box)) {
        stableSince = Date.now(); anchor = box;
        setProgress(0);
      } else {
        const fraction = Math.min(1, (Date.now() - stableSince) / 1500);
        setProgress(fraction);
        if (fraction === 1) captureRef.current?.(box);
      }
      previous = box;
    }, 250);
    return () => clearInterval(timer);
  }, [ready, automatic]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch { setTorchAvailable(false); }
  };

  const capture = async (box = null) => {
    const v = videoRef.current;
    if (!v || !ready || capturedRef.current) return;
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) {
      setError('Esperá que la cámara enfoque o usá la cámara del teléfono.');
      return;
    }
    capturedRef.current = true;
    setError(null);
    try {
    const track = streamRef.current?.getVideoTracks()[0];
    // ImageCapture da la foto a resolución completa del sensor cuando existe (Android/Chrome)
    if (!box && track && 'ImageCapture' in window) {
      try {
        const blob = await new window.ImageCapture(track).takePhoto();
        streamRef.current.getTracks().forEach((t) => t.stop());
        return onCapture(blob);
      } catch { /* sigue con el frame de video */ }
    }
    const c = document.createElement('canvas');
    const crop = box ? documentCrop(box, v.videoWidth, v.videoHeight) : { x: 0, y: 0, width: v.videoWidth, height: v.videoHeight };
    c.width = crop.width;
    c.height = crop.height;
    c.getContext('2d').drawImage(v, crop.x, crop.y, crop.width, crop.height, 0, 0, c.width, c.height);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(c);
    } catch {
      capturedRef.current = false;
      setError('No se pudo tomar la foto. Probá otra vez o usá la cámara del teléfono.');
    }
  };
  captureRef.current = capture;

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f && !capturedRef.current) { capturedRef.current = true; streamRef.current?.getTracks().forEach((t) => t.stop()); onCapture(f); }
  };

  const choosePhoto = (ref) => {
    // Prevent an automatic shot while the operating system's photo picker is open.
    setAutomatic(false);
    ref.current?.click();
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div className="relative" style={{ width: '100%', height: '100%' }}>
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
        {ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {!documentBox && <div className="relative h-[78%] w-[80%] max-w-lg rounded-[18px] border-2 border-white/40">
              {['-left-0.5 -top-0.5 border-l-4 border-t-4 rounded-tl-[18px]', '-right-0.5 -top-0.5 border-r-4 border-t-4 rounded-tr-[18px]',
                '-left-0.5 -bottom-0.5 border-l-4 border-b-4 rounded-bl-[18px]', '-right-0.5 -bottom-0.5 border-r-4 border-b-4 rounded-br-[18px]'].map((c) => (
                <span key={c} className={`absolute size-8 border-saline ${c}`} />
              ))}
              <span className="scan-line absolute left-3 right-3 h-0.5 bg-saline/80 shadow-[0_0_12px_2px_rgba(0,101,179,.6)]" />
            </div>}
          </div>
        )}
        {documentBox && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${videoSize.width} ${videoSize.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <rect x={documentBox.x * videoSize.width} y={documentBox.y * videoSize.height} width={documentBox.width * videoSize.width} height={documentBox.height * videoSize.height} fill="rgba(16,185,129,.08)" stroke={documentBox.sharp ? '#34d399' : '#fbbf24'} strokeWidth="4" vectorEffect="non-scaling-stroke" rx="8" />
        </svg>}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <p className="max-w-xs text-white/85">{error}</p>
          </div>
        )}
        </div>
      </div>

      <div className="safe-bottom max-h-[48dvh] overflow-y-auto px-6 pt-3">
        {ready && <div className="mx-auto mb-3 max-w-md text-center" aria-live="polite">
          <p className="text-sm font-medium">{!automatic ? 'Modo manual' : !documentBox ? 'Buscando documento: mostrá los cuatro bordes' : !documentBox.sharp ? 'Mejorá la luz y esperá que enfoque' : progress > 0 ? 'Mantené quieto: tomando foto automáticamente…' : 'Documento detectado. Mantené el teléfono quieto'}</p>
          <div className="mt-2 h-1 overflow-hidden rounded bg-white/15"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress * 100}%` }} /></div>
          <button type="button" onClick={() => setAutomatic(value => !value)} aria-pressed={automatic} className="mt-2 rounded-lg px-3 py-2 text-xs text-white/80">Foto automática: {automatic ? 'activada' : 'desactivada'}</button>
        </div>}
        <ul className="mb-5 space-y-1 text-center text-[13px] text-white/65">
          <li>Papel plano, con buena luz y sin sombras.</li>
          <li>Que se vean el estudio, la visita, el importe y la aclaración.</li>
        </ul>
        <div className="flex items-center justify-between">
          <button onClick={() => choosePhoto(fileRef)} className="flex w-20 flex-col items-center gap-1 text-xs text-white/80">
            <span className="grid size-12 place-items-center rounded-full bg-white/10"><ImageUp className="size-5" /></span>
            Elegir foto
          </button>
          <button onClick={() => ready ? capture() : choosePhoto(nativeCameraRef)} aria-label="Sacar foto"
            className="grid size-20 place-items-center rounded-full border-4 border-white/90 disabled:opacity-40">
            <span className="size-[62px] rounded-full bg-white transition-transform active:scale-90" />
          </button>
          <button onClick={() => choosePhoto(nativeCameraRef)} className="w-20 rounded-xl px-1 py-3 text-center text-xs text-white/80">Cámara del teléfono</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <input ref={nativeCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}
