"use client";
import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = { initialUrl: string; onClose: () => void };
export function PhoneShare({ initialUrl, onClose }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [notice, setNotice] = useState("");
  useEffect(() => setUrl(initialUrl), [initialUrl]);
  let valid = false;
  let local = false;
  try {
    const parsed = new URL(url);
    valid = ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    valid = false;
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
    <div role="dialog" aria-modal="true" aria-label="Share mobile app" className="w-full max-w-md space-y-3 rounded bg-white p-4 text-slate-900">
      <h2 className="text-lg font-bold">📱 Share / Open on Phone</h2>
      <label className="block">Mobile app URL<input className="w-full rounded border p-2" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-mobile-tunnel.example" /></label>
      {valid ? <div className="flex justify-center bg-white p-3"><QRCodeSVG value={url} size={200} marginSize={4} title="Mobile app URL QR code" /></div> : <p role="alert">Enter a valid HTTP(S) URL without credentials, query or fragment.</p>}
      {local && <p className="text-amber-700">This localhost URL only works on this computer. Enter your mobile tunnel URL for another device.</p>}
      <p className="text-sm">Use HTTPS and an authenticated, access-controlled tunnel. The app&apos;s demo identity and shared sync token are not production authentication.</p>
      {notice && <p role="status">{notice}</p>}
      <div className="flex gap-2"><button className="rounded border p-2" disabled={!valid} onClick={() => { if (!navigator.clipboard) { setNotice("Clipboard unavailable; select the URL above."); return; } void navigator.clipboard.writeText(url).then(() => setNotice("URL copied.")).catch(() => setNotice("Copy failed; select the URL above.")); }}>Copy URL</button><button className="rounded border p-2" onClick={onClose}>Close</button></div>
    </div>
  </div>;
}
