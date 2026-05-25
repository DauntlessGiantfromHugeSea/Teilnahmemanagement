"use client";

import { useState } from "react";

export function CopyableKey({ value, label }: { value: string; label?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function doCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: per textarea
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  if (!value) {
    return (
      <span className="inline-block rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs text-red-700">
        {label ?? "Wert"} ist nicht gesetzt
      </span>
    );
  }

  const masked = value.slice(0, 6) + "…" + value.slice(-4);

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <code
        onClick={doCopy}
        className="cursor-pointer select-all font-mono text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded break-all"
        title="Zum Kopieren klicken"
      >
        {shown ? value : masked}
      </code>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="btn-row"
      >
        {shown ? "Verbergen" : "Anzeigen"}
      </button>
      <button type="button" onClick={doCopy} className="btn-row">
        {copied ? "Kopiert ✓" : "Kopieren"}
      </button>
    </span>
  );
}
