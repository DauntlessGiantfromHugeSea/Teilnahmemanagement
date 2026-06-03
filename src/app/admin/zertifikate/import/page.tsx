import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ZertifikateImportPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const total = await prisma.certificate.count();
  const zTotal = await prisma.certificate.count({ where: { type: "ZERTIFIKAT" } });
  const tnTotal = await prisma.certificate.count({ where: { type: "TEILNAHMEBESCHEINIGUNG" } });

  return (
    <Shell session={s} active="zertifikate">
      <h1 className="text-2xl font-semibold mb-1">Historische Zertifikate importieren</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Lädt die aufbereiteten CSVs ein. Zeilen mit gesetzter Zertifikatsnummer werden 1:1
        übernommen — bereits ausgestellte Nummern bleiben unverändert. Zeilen ohne Nummer
        bekommen automatisch die nächste freie Nummer im korrekten Format
        (Z: <code>JJ-INI-FBA/NNN</code>, TN: <code>JJ-TN-INI-JJ/NNN</code>).
        Dubletten werden übersprungen.
      </p>

      <div className="card p-4 mb-4 text-sm">
        Aktuell in der Datenbank: <strong>{total}</strong> Einträge — davon{" "}
        <strong>{zTotal}</strong> Zertifikate und <strong>{tnTotal}</strong> Teilnahmebescheinigungen.
      </div>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <form
        method="post"
        action="/api/admin/zertifikate/import"
        encType="multipart/form-data"
        className="card p-4 space-y-4 max-w-2xl"
      >
        <div>
          <label className="label">Zertifikate-CSV (optional)</label>
          <input type="file" name="zertifikate" accept=".csv,text/csv" className="input" />
          <p className="text-xs text-slate-500 mt-1">
            Spalten: <code>ID; Zertifikatsnummer; Ausgestellt_am; Gueltig_bis; Nachname; Vorname;
            Aussteller; Schulungsort; Schulungsleiter; Datum_Schulung; Kompetenzfeld; Kopffeld;
            Bestaetigungstext; Bewertungstext</code>
          </p>
        </div>
        <div>
          <label className="label">Teilnahmebescheinigungen-CSV (optional)</label>
          <input type="file" name="teilnahme" accept=".csv,text/csv" className="input" />
          <p className="text-xs text-slate-500 mt-1">
            Spalten: <code>ID; Zertifikatsnummer; Ausgestellt_am; Nachname; Vorname; Firma;
            Datum_Schulung; Schulungsort; Schulungsleiter; Praesenz_Online; Titel</code>
          </p>
        </div>
        <button className="btn-primary">Importieren</button>
        <p className="text-xs text-slate-500">
          UTF-8, Semikolon oder Komma als Trennzeichen. Bei 1000+ Zeilen kann der Import
          30–60 Sekunden dauern.
        </p>
      </form>

      <form method="post" action="/api/admin/zertifikate/backfill-validity" className="mt-6 max-w-2xl">
        <h2 className="font-semibold mb-1">Gültigkeit nachtragen</h2>
        <p className="text-xs text-slate-500 mb-2">
          Trägt für alle Zertifikate (Typ ZERTIFIKAT) ohne „gültig bis"-Datum automatisch
          Ausstellungsdatum + 24 Monate nach. Bereits gesetzte Daten bleiben unverändert.
        </p>
        <button className="btn-secondary text-sm">24-Monats-Gültigkeit nachtragen</button>
      </form>
    </Shell>
  );
}
