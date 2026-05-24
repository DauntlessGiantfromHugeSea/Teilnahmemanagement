"use client";

import { useEffect, useRef, useState } from "react";

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Klick ausserhalb schliesst
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current || !btnRef.current) return;
      const t = e.target as Node;
      if (menuRef.current.contains(t) || btnRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Beim Oeffnen Position anhand des Buttons festlegen.
  // Menue 220px breit, rechtsbuendig unter den Button.
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 240;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
    const top = r.bottom + 6;
    setPos({ top, left });
    setOpen(true);
  }

  // Beim Resize/Scroll schliessen, damit Position nicht veraltet
  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const post = (action: string) => `/api/admin/users/${userId}/${action}`;

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
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-row"
      >
        Aktionen
        <span aria-hidden className="ml-1 text-slate-400">
          ▾
        </span>
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          role="menu"
          className="menu-panel"
          style={{
            position: "fixed",
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            display: "block",
            width: "240px",
          }}
        >
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
      )}
    </>
  );
}
