import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { ConfirmForm } from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

const ROLE_INFO: Record<Role, { label: string; desc: string }> = {
  ADMIN: {
    label: "Administrator",
    desc: "Voller Zugriff auf alles inkl. Benutzerverwaltung, Einstellungen, Buchhaltung.",
  },
  EDITOR: {
    label: "Bearbeiter",
    desc: "Veranstaltungen und Teilnehmer anlegen/bearbeiten. Kein Admin-Bereich.",
  },
  ACCOUNTING: {
    label: "Buchhaltung",
    desc: "Buchhaltungs-Ansicht und Rechnungsstatus. Kann alle Veranstaltungen sehen.",
  },
  VIEWER: {
    label: "Betrachter",
    desc: "Nur Lese-Zugriff auf zugewiesene Veranstaltungen.",
  },
};

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string; link?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u) notFound();

  const isSelf = u.id === s.uid;
  const has2fa = u.totpEnabled || u.emailCodeEnabled;

  return (
    <Shell session={s} active="users">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link
            href="/admin/users"
            className="text-xs text-slate-500 hover:text-brand-700 hover:underline"
          >
            ← Benutzerliste
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Benutzer bearbeiten</h1>
          <p className="text-sm text-slate-500 mt-1">{u.email}</p>
        </div>
      </div>

      {searchParams.ok && (
        <div className="toast-ok mb-4">
          <span aria-hidden>✓</span>
          <span>{searchParams.ok}</span>
        </div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4">
          <span aria-hidden>!</span>
          <span>{searchParams.error}</span>
        </div>
      )}
      {searchParams.link && (
        <div className="toast-warn mb-4 flex-col items-stretch">
          <div className="font-semibold">Link manuell weitergeben:</div>
          <div className="font-mono text-xs break-all mt-1">{searchParams.link}</div>
        </div>
      )}

      <form
        method="post"
        action={`/api/admin/users/${u.id}/edit`}
        className="space-y-6 max-w-3xl"
      >
        {/* Stammdaten */}
        <section className="card p-6">
          <h2 className="font-semibold mb-1">Stammdaten</h2>
          <p className="text-xs text-slate-500 mb-4">Name und E-Mail-Adresse des Kontos.</p>
          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                name="name"
                defaultValue={u.name}
                required
                className="input text-base"
              />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input
                type="email"
                name="email"
                defaultValue={u.email}
                required
                className="input text-base font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Wird auch für Login und 2FA-Codes verwendet.
              </p>
            </div>
          </div>
        </section>

        {/* Rolle als grosse Zeilen statt Dropdown */}
        <section className="card p-6">
          <h2 className="font-semibold mb-1">Rolle</h2>
          <p className="text-xs text-slate-500 mb-4">Bestimmt, was der Nutzer sehen und tun darf.</p>
          {isSelf && (
            <div className="toast-warn mb-4 text-xs">
              Eigene Rolle kann nicht geändert werden.
            </div>
          )}
          <div className="space-y-2">
            {Object.values(Role).map((r) => {
              const info = ROLE_INFO[r];
              const selected = u.role === r;
              return (
                <label
                  key={r}
                  className={
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition " +
                    (selected
                      ? "border-brand-600 bg-brand-50/60"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50") +
                    (isSelf ? " opacity-60 cursor-not-allowed" : "")
                  }
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    defaultChecked={selected}
                    disabled={isSelf}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">{info.label}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{info.desc}</div>
                    <div className="text-[10px] font-mono uppercase text-slate-400 mt-1">{r}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Optionen als grosse Zeilen mit Toggles */}
        <section className="card p-6">
          <h2 className="font-semibold mb-1">Konto-Status &amp; 2FA-Pflicht</h2>
          <p className="text-xs text-slate-500 mb-4">
            Steuert Login-Möglichkeit und ob 2FA eingerichtet werden muss.
          </p>
          <div className="space-y-2">
            <label
              className={
                "flex items-start gap-3 p-4 rounded-lg border-2 border-slate-200 hover:bg-slate-50 transition" +
                (isSelf ? " opacity-60" : " cursor-pointer")
              }
            >
              <input
                type="checkbox"
                name="active"
                defaultChecked={u.active}
                disabled={isSelf}
                className="mt-1 h-5 w-5 accent-brand-600"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Konto aktiv</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Deaktivierte Konten können sich nicht anmelden. Daten bleiben erhalten.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <input
                type="checkbox"
                name="totpRequired"
                defaultChecked={u.totpRequired}
                className="mt-1 h-5 w-5 accent-brand-600"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">2FA verpflichtend</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Wenn aktiv, muss der Nutzer beim nächsten Login 2FA einrichten.
                </div>
                <div className="text-xs mt-1">
                  Aktueller Status:{" "}
                  {u.totpEnabled ? (
                    <span className="badge bg-emerald-50 text-emerald-700">TOTP aktiv</span>
                  ) : u.emailCodeEnabled ? (
                    <span className="badge bg-emerald-50 text-emerald-700">E-Mail-Code aktiv</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-600">2FA nicht eingerichtet</span>
                  )}
                </div>
              </div>
            </label>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/users" className="btn-secondary">
            Abbrechen
          </Link>
          <button className="btn-primary">Änderungen speichern</button>
        </div>
      </form>

      {/* Aktionen als grosse Zeilen (kein Dropdown mehr) */}
      <section className="card p-6 max-w-3xl mt-6">
        <h2 className="font-semibold mb-1">Aktionen</h2>
        <p className="text-xs text-slate-500 mb-4">
          Direktaktionen für dieses Konto.
        </p>
        <div className="space-y-2">
          <Link
            href={`/admin/users/${u.id}/access`}
            className="flex items-start gap-3 p-4 rounded-lg border-2 border-slate-200 hover:border-brand-300 hover:bg-brand-50/30 transition"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm">Zugriffe verwalten</div>
              <div className="text-xs text-slate-600 mt-0.5">
                Veranstaltungen festlegen, die dieser Nutzer sehen/bearbeiten darf.
              </div>
            </div>
            <span className="text-slate-400">→</span>
          </Link>

          <form method="post" action={`/api/admin/users/${u.id}/reset-link`} className="block">
            <button className="w-full flex items-start gap-3 p-4 rounded-lg border-2 border-slate-200 hover:border-brand-300 hover:bg-brand-50/30 transition text-left">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Passwort-Link senden</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Erzeugt einen neuen Setze-Passwort-Link (14 Tage gültig) und schickt ihn per Mail.
                </div>
              </div>
              <span className="text-slate-400">↻</span>
            </button>
          </form>

          {has2fa && (
            <ConfirmForm
              action={`/api/admin/users/${u.id}/reset2fa`}
              message="2FA für diesen Nutzer zurücksetzen?"
              className="block"
            >
              <button className="w-full flex items-start gap-3 p-4 rounded-lg border-2 border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 transition text-left">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">2FA zurücksetzen</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Entfernt TOTP/E-Mail-Code-Einrichtung. Nutzer muss 2FA neu einrichten.
                  </div>
                </div>
                <span className="text-slate-400">⚠</span>
              </button>
            </ConfirmForm>
          )}

          {!isSelf && (
            <ConfirmForm
              action={`/api/admin/users/${u.id}/delete`}
              message={`Nutzer ${u.email} endgültig löschen?`}
              className="block"
            >
              <button className="w-full flex items-start gap-3 p-4 rounded-lg border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50/40 transition text-left">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-rose-700">Nutzer löschen</div>
                  <div className="text-xs text-rose-600/80 mt-0.5">
                    Konto und alle Anmeldedaten unwiderruflich entfernen.
                  </div>
                </div>
                <span className="text-rose-400">✕</span>
              </button>
            </ConfirmForm>
          )}
        </div>
      </section>
    </Shell>
  );
}
