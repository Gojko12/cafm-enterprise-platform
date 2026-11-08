"use client";

import React, { useEffect, useRef, useState } from "react";

export function ResizableHistory({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState<number | "expanded">(190);
  const panel = useRef<HTMLElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const limit = () => (panel.current?.parentElement?.clientHeight ?? window.innerHeight) * 0.75;
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    cleanup.current?.();
    const origin = event.clientY, initial = panel.current?.getBoundingClientRect().height ?? 190;
    const move = (next: PointerEvent) => setHeight(Math.max(100, Math.min(limit(), initial + origin - next.clientY)));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); cleanup.current = null; };
    cleanup.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return <section ref={panel} className="flex shrink-0 flex-col overflow-hidden border-t bg-white" style={{ height: height === "expanded" ? "75%" : height, maxHeight: "75%" }}>
    <div className="flex shrink-0 items-center border-b bg-slate-100 px-3">
      <div role="separator" aria-label="Resize history" aria-orientation="horizontal" tabIndex={0} className="flex-1 cursor-ns-resize select-none text-center" onPointerDown={resize}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const current = panel.current?.getBoundingClientRect().height ?? 190;
          setHeight(Math.max(100, Math.min(limit(), current + (event.key === "ArrowUp" ? 20 : -20))));
        }}>══</div>
      <button type="button" className="rounded border bg-white px-2 py-1 text-xs" onClick={() => setHeight((current) => current === "expanded" ? 190 : "expanded")}>↕ {height === "expanded" ? "Restore" : "Expand"}</button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </section>;
}
