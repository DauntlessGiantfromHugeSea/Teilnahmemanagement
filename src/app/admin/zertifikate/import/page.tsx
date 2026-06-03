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

  return (
    <Shell session={s} active="zertifikate">
      <h1 className="text-2xl font-semibold mb-1">Historische Zertifikate importieren</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Lädt die bestehende Excel (Zertifikate_FBA_V.xx.xlsm) ein und legt für jede Zeile
        einen Zertifikats-Eintrag mit Status „freigegeben" an. Dubletten (gleiche Nummer
        wie bereits vorhanden) werden übersprungen. Importierte Zertifikate haben keinen
        verknüpften Teilnehmer-Datensatz, sind aber über die Validierungs-URL aufrufbar.
      </p>

      <div className="card p-4 mb-4 text-sm">
        Aktuell in der Datenbank: <strong>{total}</strong> Zertifikate.
      </div>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <form
        method="post"
        action="/api/admin/zertifikate/import"
        encType="multipart/form-data"
        className="card p-4 space-y-3 max-w-xl"
      >
        <div>
          <label className="label">Excel-Datei (.xlsm / .xlsx)</label>
          <input type="file" name="file" accept=".xlsm,.xlsx" required className="input" />
        </div>
        <button className="btn-primary">Importieren</button>
        <p className="text-xs text-slate-500">
          Bei 1000+ Zeilen kann der Import 30–60 Sekunden dauern. Lass das Browser-Tab in der Zwischenzeit offen.
        </p>
      </form>
    </Shell>
  );
}
