import Link from "next/link";
import { redirect } from "next/navigation";
import { MailboxProvider, type Mailbox } from "@prisma/client";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "nie";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function MailboxFields({ mb }: { mb?: Mailbox }) {
  return (
    <>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Postfach-Typ *</label>
        <select
          name="provider"
          defaultValue={mb?.provider ?? MailboxProvider.MS_GRAPH}
          className="input text-sm w-full sm:w-80"
        >
          <option value={MailboxProvider.MS_GRAPH}>Microsoft 365 (Graph)</option>
          <option value={MailboxProvider.IMAP}>IMAP (Benutzer + Passwort)</option>
        </select>
        <p className="text-xs text-slate-400 mt-1">
          Microsoft 365 hat Basic Auth für IMAP/SMTP abgeschaltet — für M365-Postfächer
          funktioniert nur der Graph-Zugang. Ausgefüllt wird dann nur der Microsoft-Block,
          die IMAP/SMTP-Felder bleiben leer.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">E-Mail-Adresse *</label>
          <input
            name="address"
            defaultValue={mb?.address ?? ""}
            placeholder="schulung@fb-akademie.de"
            required
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Bezeichnung *</label>
          <input
            name="label"
            defaultValue={mb?.label ?? ""}
            placeholder="Schulung"
            required
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Absendername</label>
          <input
            name="fromName"
            defaultValue={mb?.fromName ?? ""}
            placeholder="FB-Akademie Schulung"
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Farbe</label>
          <input
            name="color"
            type="color"
            defaultValue={mb?.color ?? "#0f766e"}
            className="h-9 w-full cursor-pointer rounded border border-slate-200"
          />
        </div>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">
          Microsoft 365 (nur bei Typ „Microsoft 365")
        </legend>
        <p className="text-xs text-slate-500">
          Leer lassen, um die App-Registrierung des Entra-SSO aus der <code>.env</code> zu
          verwenden (<code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>,{" "}
          <code>MS_CLIENT_SECRET</code>). Die App braucht die{" "}
          <strong>Anwendungsberechtigungen</strong> <code>Mail.ReadWrite</code> und{" "}
          <code>Mail.Send</code> mit Administrator-Zustimmung.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tenant-ID</label>
            <input
              name="graphTenantId"
              defaultValue={mb?.graphTenantId ?? ""}
              placeholder="aus der .env"
              className="input text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Client-ID</label>
            <input
              name="graphClientId"
              defaultValue={mb?.graphClientId ?? ""}
              placeholder="aus der .env"
              className="input text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Client-Secret {mb?.graphClientSecret ? "(leer = unverändert)" : ""}
            </label>
            <input
              name="graphClientSecret"
              type="password"
              autoComplete="new-password"
              placeholder={mb?.graphClientSecret ? "••••••••" : "aus der .env"}
              className="input text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ordner</label>
            <input
              name="graphFolder"
              defaultValue={mb?.graphFolder ?? "inbox"}
              className="input text-sm w-full"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">
          IMAP / SMTP (nur bei Typ „IMAP")
        </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">IMAP-Server</label>
          <input
            name="imapHost"
            defaultValue={mb?.imapHost ?? ""}
            placeholder="w020deb9.kasserver.com"
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Port</label>
          <input
            name="imapPort"
            type="number"
            defaultValue={mb?.imapPort ?? 993}
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">SSL</label>
          <select
            name="imapSecure"
            defaultValue={String(mb?.imapSecure ?? true)}
            className="input text-sm w-full"
          >
            <option value="true">ja (993)</option>
            <option value="false">nein (143/STARTTLS)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ordner</label>
          <input
            name="imapFolder"
            defaultValue={mb?.imapFolder ?? "INBOX"}
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Aktiv</label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={mb?.active ?? true}
              className="h-4 w-4"
            />
            abholen
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">IMAP-Benutzer</label>
          <input
            name="imapUser"
            defaultValue={mb?.imapUser ?? ""}
            placeholder="m07f3b68 oder schulung@fb-akademie.de"
            className="input text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            IMAP-Passwort {mb ? "(leer = unverändert)" : ""}
          </label>
          <input
            name="imapPass"
            type="password"
            autoComplete="new-password"
            placeholder={mb ? "••••••••" : ""}
            className="input text-sm w-full"
          />
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
          SMTP abweichend konfigurieren (optional)
        </summary>
        <p className="text-xs text-slate-500 mt-2 mb-3">
          Leer lassen, wenn über denselben Zugang bzw. die globale SMTP-Konfiguration aus der
          <code className="mx-1">.env</code> verschickt werden soll. Der Absender ist in beiden
          Fällen die Adresse dieses Postfachs.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">SMTP-Server</label>
            <input name="smtpHost" defaultValue={mb?.smtpHost ?? ""} className="input text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Port</label>
            <input
              name="smtpPort"
              type="number"
              defaultValue={mb?.smtpPort ?? ""}
              className="input text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">SSL</label>
            <select
              name="smtpSecure"
              defaultValue={mb?.smtpSecure === null || mb?.smtpSecure === undefined ? "" : String(mb.smtpSecure)}
              className="input text-sm w-full"
            >
              <option value="">automatisch</option>
              <option value="true">ja (465)</option>
              <option value="false">nein (587)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Benutzer</label>
            <input name="smtpUser" defaultValue={mb?.smtpUser ?? ""} className="input text-sm w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">
              Passwort {mb ? "(leer = unverändert)" : ""}
            </label>
            <input
              name="smtpPass"
              type="password"
              autoComplete="new-password"
              className="input text-sm w-full"
            />
          </div>
        </div>
      </details>
      </fieldset>
    </>
  );
}

export default async function PostfaecherPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const mailboxes = await prisma.mailbox.findMany({
    orderBy: { label: "asc" },
    include: { _count: { select: { tickets: true } } },
  });

  return (
    <Shell session={s} active="postfaecher">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold">Postfächer</h1>
        <div className="flex items-center gap-3">
          <Link href="/posteingang" className="text-sm text-brand-700 hover:underline">
            → Posteingang
          </Link>
          <form method="post" action="/api/admin/mailboxes/poll">
            <button className="btn-secondary text-sm">Jetzt abholen</button>
          </form>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Diese Postfächer werden überwacht — Microsoft 365 über die Graph-API, klassische
        Postfächer über IMAP. Gelesen wird nur: es werden keine Mails verschoben oder als
        gelesen markiert, das Postfach bleibt also parallel ganz normal nutzbar. Der Abruf läuft über den Cron-Endpunkt{" "}
        <code className="text-xs">/api/cron/mail-ingest</code>; „Jetzt abholen“ stößt denselben
        Vorgang von Hand an.
      </p>

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

      <div className="space-y-4 mb-6">
        {mailboxes.map((mb) => (
          <div key={mb.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: mb.color ?? "#94a3b8" }}
                />
                {mb.label}
                <span className="font-normal text-slate-500 text-sm">{mb.address}</span>
                {!mb.active && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">
                    pausiert
                  </span>
                )}
              </h2>
              <div className="text-xs text-slate-500">
                {mb.provider === MailboxProvider.MS_GRAPH ? "Microsoft 365" : "IMAP"} ·{" "}
                {mb._count.tickets} Tickets · zuletzt abgeholt {fmt(mb.lastPollAt)} ·{" "}
                {mb.provider === MailboxProvider.MS_GRAPH
                  ? `Stand ${fmt(mb.lastSyncAt)}`
                  : `UID ${mb.lastUid}`}
              </div>
            </div>

            {mb.lastError && (
              <div className="toast-error mb-3 text-xs">
                <span aria-hidden>!</span>
                <span>Letzter Fehler: {mb.lastError}</span>
              </div>
            )}

            <form method="post" action={`/api/admin/mailboxes/${mb.id}`} className="space-y-3">
              <MailboxFields mb={mb} />
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn-primary text-sm">Speichern</button>
                <button
                  formAction={`/api/admin/mailboxes/${mb.id}/test`}
                  formNoValidate
                  className="btn-secondary text-sm"
                >
                  Verbindung testen
                </button>
                <button
                  formAction={`/api/admin/mailboxes/${mb.id}/delete`}
                  formNoValidate
                  className="text-sm text-rose-700 hover:underline ml-auto"
                >
                  Postfach löschen
                </button>
              </div>
            </form>
          </div>
        ))}
        {mailboxes.length === 0 && (
          <div className="card p-5 text-sm text-slate-600">Noch kein Postfach eingerichtet.</div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Neues Postfach</h2>
        <form method="post" action="/api/admin/mailboxes" className="space-y-3">
          <MailboxFields />
          <button className="btn-primary text-sm">Postfach anlegen</button>
        </form>
      </div>
    </Shell>
  );
}
