import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getCompanySignature } from "@/lib/mailSignature";
import { buildReply } from "@/lib/ticketMail";

export const dynamic = "force-dynamic";

// Beispieldaten fuer die Live-Vorschau - es wird nichts gespeichert oder
// verschickt, nur gerendert.
const SAMPLE_BODY =
  "Guten Tag Frau Schmidt,\n\nvielen Dank für Ihre Nachricht. Direkt am Schulungsgebäude " +
  "stehen kostenfreie Parkplätze zur Verfügung.\n\nBei weiteren Fragen melden Sie sich gern.";

export default async function MailDesignPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const [company, user] = await Promise.all([
    getCompanySignature(),
    prisma.user.findUnique({ where: { id: s.uid } }),
  ]);

  const preview = user
    ? (
        await buildReply({
          ticket: { reference: "FBA-7K2M9-4XQ1P" } as never,
          mailbox: { address: "info@fb-akademie.de", label: "Info", fromName: null } as never,
          user,
          bodyText: SAMPLE_BODY,
        })
      ).html
    : "";

  return (
    <Shell session={s} active="mail-design">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold">Mail-Design</h1>
        <Link href="/account/signatur" className="text-sm text-brand-700 hover:underline">
          Meine persönliche Signatur →
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Logo, Farbe, Fußzeile und Rechtstexte für alle Antworten aus dem Posteingang. Diese
        Angaben gelten firmenweit — die persönlichen Felder (Name, Titel, Durchwahl) pflegt
        jeder Benutzer selbst unter „Meine E-Mail-Signatur".
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <form
          method="post"
          action="/api/admin/mail-design"
          encType="multipart/form-data"
          className="card p-5 space-y-5"
        >
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Logo</h2>
            {company.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={company.logoUrl}
                alt="Aktuelles Mail-Logo"
                className="h-14 w-auto rounded border border-slate-200 bg-white p-2"
              />
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Logo hochladen</label>
              <input
                type="file"
                name="logoFile"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="input text-sm w-full"
              />
              <p className="text-xs text-slate-400 mt-1">
                Überschreibt das URL-Feld. Die Datei landet in der Media-Library.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">… oder Logo-URL</label>
                <input
                  name="logoUrl"
                  defaultValue={company.logoUrl}
                  placeholder="https://… oder /uploads/…"
                  className="input text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Breite (px)</label>
                <input
                  name="logoWidth"
                  type="number"
                  min={40}
                  max={400}
                  defaultValue={company.logoWidth}
                  className="input text-sm w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Akzentfarbe</label>
              <input
                name="accentColor"
                type="color"
                defaultValue={company.accentColor}
                className="h-9 w-24 cursor-pointer rounded border border-slate-200"
              />
              <p className="text-xs text-slate-400 mt-1">
                Kopfbereich der Mail, Icons und Links in der Signatur.
              </p>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-800">Fußzeile</h2>
            <p className="text-xs text-slate-500">
              Steht unter jeder Antwort — unabhängig davon, aus welchem Postfach verschickt wird.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Firmenname</label>
                <input
                  name="footerName"
                  defaultValue={company.footerName}
                  placeholder="Flüssigboden Akademie"
                  className="input text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Kontakt-E-Mail</label>
                <input
                  name="footerEmail"
                  defaultValue={company.footerEmail}
                  placeholder="info@fb-akademie.de"
                  className="input text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Telefon (optional)</label>
                <input
                  name="footerPhone"
                  defaultValue={company.footerPhone}
                  placeholder="+49 341 24469-30"
                  className="input text-sm w-full"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-800">Rechtsangaben</h2>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Eine Zeile pro Angabe</label>
              <textarea
                name="legalLines"
                rows={3}
                defaultValue={company.legalLines.join("\n")}
                className="input text-sm w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Vertraulichkeitshinweis (deutsch)
              </label>
              <textarea
                name="disclaimerDe"
                rows={4}
                defaultValue={company.disclaimerDe}
                className="input text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Vertraulichkeitshinweis (englisch)
              </label>
              <textarea
                name="disclaimerEn"
                rows={4}
                defaultValue={company.disclaimerEn}
                className="input text-sm w-full"
              />
            </div>
          </section>

          <button className="btn-primary text-sm">Mail-Design speichern</button>
        </form>

        <section className="card p-5 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Vorschau</h2>
          <p className="text-xs text-slate-500 mb-3">
            Beispielantwort mit dem gespeicherten Design und deiner Signatur.
          </p>
          <iframe
            title="Mail-Vorschau"
            sandbox=""
            srcDoc={preview}
            className="w-full h-[720px] rounded border border-slate-200 bg-white"
          />
        </section>
      </div>
    </Shell>
  );
}
