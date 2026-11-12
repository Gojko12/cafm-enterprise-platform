"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { compressCanvasSource, compressImageFile } from "../../lib/image-compress";

type Facing = "environment" | "user";
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

function CameraViewfinder({ onUse, onClose, onUnavailable, onNativeFile }: {
  onUse: (dataUrl: string) => void; onClose: () => void; onUnavailable: () => void; onNativeFile: (files: FileList | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (captured) return;
    stop();
    setReady(false); setTorchOn(false); setTorchAvailable(false);
    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
      } catch (first) {
        if (first instanceof DOMException && (first.name === "NotAllowedError" || first.name === "SecurityError")) {
          if (!cancelled) { setError("Camera permission was denied. Use the phone camera app or upload instead."); onUnavailable(); }
          return;
        }
        try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        catch { if (!cancelled) { setError("No camera could be started. Use the phone camera app or upload instead."); onUnavailable(); } return; }
      }
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.muted = true;
        video.setAttribute("playsinline", "true");
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      setTorchAvailable(!!(track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch);
      setError(""); setReady(true);
    })();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, captured]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] }); setTorchOn(!torchOn); } catch { setTorchAvailable(false); }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try { setCaptured(compressCanvasSource(video, video.videoWidth, video.videoHeight)); stop(); } catch { setError("Could not capture the photo."); }
  };

  const close = () => { stop(); onClose(); };
  const button = "min-h-[44px] rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/25";

  return <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-[100] flex flex-col bg-black">
    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
      <button type="button" className={button} onClick={close}>✕ Close</button>
      <div className="flex flex-wrap gap-2">
        {torchAvailable && !captured && <button type="button" className={button} aria-pressed={torchOn} onClick={() => void toggleTorch()}>🔦 {torchOn ? "Torch On" : "Torch"}</button>}
        {!captured && <button type="button" className={button} onClick={() => setFacing((current) => current === "environment" ? "user" : "environment")}>🔄 Flip Camera</button>}
        <button type="button" className={button} onClick={() => nativeRef.current?.click()}>📱 Phone Camera App</button>
        <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(event) => { onNativeFile(event.target.files); event.target.value = ""; close(); }} />
      </div>
    </div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      {captured
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={captured} alt="Captured preview" className="max-h-full max-w-full object-contain" />
        : <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />}
      {error && <p role="alert" className="absolute inset-x-4 top-4 rounded bg-red-600/90 p-2 text-center text-sm text-white">{error}</p>}
      {!captured && !ready && !error && <p className="absolute text-sm text-white/80">Starting camera…</p>}
    </div>
    <div className="flex items-center justify-center gap-4 p-5">
      {captured ? <>
        <button type="button" className={button} onClick={() => setCaptured(null)}>Retake</button>
        <button type="button" className="min-h-[44px] rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold text-white" onClick={() => { onUse(captured); close(); }}>✓ Use Photo</button>
      </> : <button type="button" aria-label="Capture photo" disabled={!ready} onClick={shoot}
        className="h-16 w-16 rounded-full border-4 border-white bg-white/90 ring-2 ring-black/30 disabled:opacity-40" />}
    </div>
  </div>;
}

export function PhotoCapture({ onPhotos, disabled, multiple = true, className = "", label }: {
  onPhotos: (dataUrls: string[]) => void; disabled?: boolean; multiple?: boolean; className?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nativeRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const ingest = async (files: FileList | null) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name));
    if (!images.length) { if (files?.length) setError("Choose an image file."); return; }
    setBusy(true); setError("");
    try { onPhotos(await Promise.all((multiple ? images : images.slice(0, 1)).map(compressImageFile))); }
    catch { setError("Could not read the photo."); }
    finally { setBusy(false); }
  };

  const takePhoto = () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) { nativeRef.current?.click(); return; }
    setError(""); setOpen(true);
  };

  const unavailable = () => { setOpen(false); nativeRef.current?.click(); };
  const inactive = disabled || busy;

  return <div className={className}>
    {label && <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>}
    <div className="flex gap-2">
      <button type="button" disabled={inactive} onClick={takePhoto} className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">📷 Take Photo</button>
      <button type="button" disabled={inactive} onClick={() => galleryRef.current?.click()} className="min-h-[44px] flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">🖼 Upload</button>
    </div>
    <input ref={galleryRef} type="file" accept="image/*" multiple={multiple} className="hidden" disabled={inactive}
      onChange={(event) => { void ingest(event.target.files); event.target.value = ""; }} />
    <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden" disabled={inactive}
      onChange={(event) => { void ingest(event.target.files); event.target.value = ""; }} />
    {busy && <p className="mt-1 text-xs text-slate-500">Processing photo…</p>}
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    {open && <CameraViewfinder onUse={(url) => onPhotos([url])} onClose={() => setOpen(false)} onUnavailable={unavailable} onNativeFile={(files) => void ingest(files)} />}
  </div>;
}

export function PhotoThumbs({ photos, onRemove, alt = "Photo" }: { photos: string[]; onRemove?: (index: number) => void; alt?: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  if (!photos.length) return null;
  return <>
    <div className="mt-2 flex flex-wrap gap-2">{photos.map((url, index) => <div key={`${index}-${url.slice(-24)}`} className="relative">
      <button type="button" aria-label={`Preview ${alt} ${index + 1}`} onClick={() => setPreview(url)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${alt} ${index + 1}`} className="h-20 w-20 rounded border object-cover" /></button>
      {onRemove && <button type="button" aria-label={`Remove ${alt} ${index + 1}`} onClick={() => onRemove(index)}
        className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-red-600 text-xs font-bold text-white shadow">×</button>}
    </div>)}</div>
    {preview && <div role="dialog" aria-label="Photo preview" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3" onClick={() => setPreview(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Full size preview" className="max-h-full max-w-full object-contain" />
      <button type="button" aria-label="Close preview" className="absolute right-3 top-3 h-10 w-10 rounded-full bg-white/20 text-xl text-white">×</button></div>}
  </>;
}
