// Verdeckter PII-Wert: zeigt Platzhalter mit Blur und Schloss-Hinweis.
// Wird genutzt, um Mail/Telefon vor Viewern/Editoren zu schuetzen.
export function PrivateValue({
  value,
  reveal,
  className,
}: {
  value: string | null | undefined;
  reveal: boolean;
  className?: string;
}) {
  if (!value) return null;
  if (reveal) {
    return <span className={className}>{value}</span>;
  }
  return (
    <span
      className={"inline-flex items-center gap-1 align-middle " + (className ?? "")}
      title="Für Admins sichtbar"
      aria-label="Für Admins sichtbar"
    >
      <span
        aria-hidden
        className="select-none rounded-md bg-slate-200/60 text-slate-400"
        style={{
          filter: "blur(4px)",
          padding: "0 6px",
          letterSpacing: "0.5px",
          userSelect: "none",
        }}
      >
        {value.replace(/./g, "•")}
      </span>
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="text-slate-400 shrink-0"
        aria-hidden
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <span className="text-[11px] text-slate-400">für Admins sichtbar</span>
    </span>
  );
}
