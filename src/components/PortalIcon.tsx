// Eigene SVG-Icons fuer Event-Portal-Bloecke - vermeidet Emoji, damit das
// Design ueber Plattformen hinweg konsistent ist.
//
// Pfade auf 24x24 viewBox normiert, strokeWidth 1.7, lineCap/Join round.

const STROKE = "currentColor";

function wrap(children: React.ReactNode, label: string) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

export function PortalIcon({ icon, className }: { icon: string | null; className?: string }) {
  return <span className={"inline-flex items-center justify-center " + (className ?? "")}>{render(icon)}</span>;
}

function render(icon: string | null): React.ReactNode {
  switch (icon) {
    case "announcement":
      // Megafon
      return wrap(
        <>
          <path d="M3 11v2a2 2 0 0 0 2 2h1l4 4V5L6 9H5a2 2 0 0 0-2 2Z" />
          <path d="M14 7c1.7 1.3 1.7 8.7 0 10" />
          <path d="M17 5c3 2 3 12 0 14" />
        </>,
        "Ankündigung",
      );
    case "wifi":
      return wrap(
        <>
          <path d="M5 12.55a11 11 0 0 1 14 0" />
          <path d="M2 8.82a16 16 0 0 1 20 0" />
          <path d="M8.5 16.43a6 6 0 0 1 7 0" />
          <circle cx="12" cy="20" r="0.7" fill={STROKE} />
        </>,
        "WLAN",
      );
    case "food":
      return wrap(
        <>
          <path d="M4 3v8a3 3 0 0 0 6 0V3" />
          <path d="M7 3v18" />
          <path d="M16 3a3 3 0 0 0-3 3v6a2 2 0 0 0 2 2h1v7" />
        </>,
        "Essen",
      );
    case "evening":
      // Mond
      return wrap(
        <path d="M20.5 14.4A8 8 0 1 1 9.6 3.5a7 7 0 0 0 10.9 10.9Z" />,
        "Abendveranstaltung",
      );
    case "location":
      return wrap(
        <>
          <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>,
        "Ort",
      );
    case "contact":
      // Telefon
      return wrap(
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" />,
        "Kontakt",
      );
    case "info":
      return wrap(
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M11 12h1v4h1" />
        </>,
        "Info",
      );
    case "warning":
      return wrap(
        <>
          <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>,
        "Hinweis",
      );
    default:
      // Generischer Bullet
      return wrap(<circle cx="12" cy="12" r="4" fill={STROKE} stroke="none" />, "");
  }
}
