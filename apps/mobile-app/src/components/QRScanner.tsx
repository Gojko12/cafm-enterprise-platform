import React, { useEffect, useRef, useState } from "react";
import type { Equipment } from "@cafm/shared-schema";

type Detector = { detect: (image: ImageBitmap | HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;
const detector = () => (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;

interface QRScannerProps {
  equipment: Equipment[];
  onScanComplete?: (equipmentCode: string) => void;
  onCancel?: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ equipment, onScanComplete, onCancel }) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream>();
  const frame = useRef<number>();
  const stop = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
    setRunning(false);
  };
  useEffect(() => () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); stream.current?.getTracks().forEach((track) => track.stop()); }, []);
  const start = async () => {
    try {
      const Constructor = detector();
      if (!Constructor) throw new Error("Live QR decoding is unavailable on this device. Choose an asset or enter its code.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS and a supported device.");
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      if (!video.current) { stop(); return; }
      video.current.srcObject = stream.current;
      await video.current.play();
      setRunning(true); setError("");
      const scanner = new Constructor({ formats: ["qr_code"] });
      const scan = async () => {
        if (!stream.current || !video.current) return;
        try {
          const found = await scanner.detect(video.current);
          if (found[0]?.rawValue) { const value = found[0].rawValue.trim(); stop(); onScanComplete?.(value); return; }
          frame.current = requestAnimationFrame(() => { void scan(); });
        } catch (problem) { stop(); setError(problem instanceof Error ? problem.message : "Camera scan failed."); }
      };
      void scan();
    } catch (problem) { stop(); setError(problem instanceof Error ? problem.message : "Could not start camera."); }
  };
  const photo = async (file?: File) => {
    if (!file) return;
    try {
      const Constructor = detector();
      if (!Constructor) throw new Error("QR decoding is unavailable on this device. Choose an asset or enter its code.");
      const bitmap = await createImageBitmap(file);
      try {
        const found = await new Constructor({ formats: ["qr_code"] }).detect(bitmap);
        if (!found[0]?.rawValue) throw new Error("No QR code found in the photo.");
        onScanComplete?.(found[0].rawValue.trim());
      } finally { bitmap.close(); }
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not decode image."); }
  };
  return <section className="space-y-3 p-4 pb-28">
    <h2 className="text-xl font-bold">Scan equipment</h2>
    <div className="relative mx-auto flex aspect-square max-h-72 items-center justify-center overflow-hidden rounded-2xl bg-slate-950">
      <video ref={video} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
      <div className="pointer-events-none relative h-40 w-40 rounded-2xl border-4 border-emerald-400 shadow-[0_0_24px_#34d399]" />
    </div>
    <button className="w-full rounded-xl bg-blue-700 p-3 text-white" onClick={() => running ? stop() : void start()}>{running ? "Stop camera" : "📷 Start Live Camera Scan"}</button>
    <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void photo(event.target.files?.[0]); event.target.value = ""; }} />
    <button className="w-full rounded-xl border bg-white p-3" onClick={() => input.current?.click()}>🖼️ Scan from Camera Photo</button>
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{error}</p>}
    <label className="block font-semibold">Search or Select Equipment<input className="mt-1 w-full rounded border p-3 font-normal" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code or name" /></label>
    <button className="rounded border bg-white p-3" disabled={!code.trim()} onClick={() => onScanComplete?.(code.trim())}>Open entered code</button>
    <div className="max-h-64 space-y-2 overflow-auto">{equipment.filter((item) => `${item.EquipmentCode} ${item.EquipmentName}`.toLowerCase().includes(code.toLowerCase())).map((item) => <button key={item.EquipmentCode} className="block w-full rounded-xl border bg-white p-3 text-left" onClick={() => onScanComplete?.(item.EquipmentCode)}><strong>{item.EquipmentCode}</strong><span className="block text-sm">{item.EquipmentName}</span></button>)}</div>
    <button className="rounded border p-3" onClick={onCancel}>Cancel</button>
  </section>;
};
