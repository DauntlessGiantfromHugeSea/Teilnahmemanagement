"use client";

import { useEffect, useRef, useState } from "react";

export function SignPad({ participantId }: { participantId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
  }, []);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointer(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointer(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    setHasInk(false);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c || !hasInk) return;
    const dataUrl = c.toDataURL("image/png");
    const form = e.currentTarget;
    const input = form.querySelector('input[name="signatureDataUrl"]') as HTMLInputElement;
    input.value = dataUrl;
    form.submit();
  }

  return (
    <div className="max-w-2xl">
      <div className="card p-4">
        <div
          className="rounded-lg border-2 border-dashed border-slate-300 bg-white relative touch-none"
          style={{ height: 260 }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onPointerLeave={end}
            className="absolute inset-0 w-full h-full rounded-lg cursor-crosshair"
          />
          {!hasInk && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
              Hier unterschreiben
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={clear} className="btn-secondary text-sm">
            Löschen
          </button>
          <form
            method="post"
            action={`/api/participants/${participantId}/anmeldebestaetigung`}
            target="_blank"
            onSubmit={submit}
            className="flex-1"
          >
            <input type="hidden" name="signatureDataUrl" />
            <button
              type="submit"
              disabled={!hasInk}
              className={"btn-primary text-sm " + (hasInk ? "" : "opacity-50 cursor-not-allowed")}
            >
              PDF mit Unterschrift erzeugen
            </button>
          </form>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Die Unterschrift wird nur in dieses eine PDF eingefügt — sie wird nicht gespeichert.
          Wenn du eine wiederverwendbare Unterschrift hinterlegen möchtest, lade sie unter
          <a href="/account" className="text-brand-700 hover:underline ml-1">Mein Konto</a> hoch.
        </p>
      </div>
    </div>
  );
}
