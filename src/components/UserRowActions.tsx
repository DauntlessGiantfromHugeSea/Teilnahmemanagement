"use client";

import { useEffect, useRef } from "react";

export function UserRowActions({
  userId,
  email,
  active,
  totpRequired,
  canDelete,
}: {
  userId: string;
  email: string;
  active: boolean;
  totpRequired: boolean;
  canDelete: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Klick ausserhalb schliesst das Menue
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.open) return;
      if (e.target instanceof Node && ref.current.contains(e.target)) return;
      ref.current.open = false;
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const post = (action: string, extra: Record<string, string> = {}) =>
    `/api/admin/users/${userId}/${action}`;

  // Wir senden via <form> direkt aus Menue-Items (POST)
  const Item = ({
    action,
    children,
    danger,
    confirmText,
    extra,
  }: {
    action: string;
    children: React.ReactNode;
    danger?: boolean;
    confirmText?: string;
    extra?: Record<string, string>;
  }) => (
    <form
      method="post"
      action={post(action)}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
      className="block"
    >
      {extra &&
        Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <button className={`menu-item ${danger ? "menu-item-danger" : ""}`}>
        {children}
      </button>
    </form>
  );

  return (
    <details ref={ref} className="menu inline-block">
      <summary className="btn-row" aria-label="Aktionen">
        Aktionen
        <span aria-hidden className="ml-1 text-slate-400">▾</span>
      </summary>
      <div className="menu-panel">
        <a className="menu-item" href={`/admin/users/${userId}/access`}>
          Zugriffe verwalten
        </a>
        <Item action="reset-link">Passwort-Link senden</Item>
        <div className="menu-divider" />
        <Item action="toggle">{active ? "Deaktivieren" : "Aktivieren"}</Item>
        <Item action="reset2fa" confirmText="2FA für diesen Nutzer zurücksetzen?">
          2FA zurücksetzen
        </Item>
        {totpRequired ? (
          <Item action="disable2fa" extra={{ mode: "disable" }}>
            2FA-Pflicht aufheben
          </Item>
        ) : (
          <Item action="disable2fa" extra={{ mode: "require-on" }}>
            2FA wieder Pflicht
          </Item>
        )}
        {canDelete && (
          <>
            <div className="menu-divider" />
            <Item
              action="delete"
              danger
              confirmText={`Nutzer ${email} endgültig löschen?`}
            >
              Nutzer löschen
            </Item>
          </>
        )}
      </div>
    </details>
  );
}
