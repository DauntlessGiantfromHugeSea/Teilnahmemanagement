import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { BADGE_TEMPLATES } from "@/lib/badgeTemplates";
import { getStaffPortalToken } from "@/lib/staffPortalToken";

export const dynamic = "force-dynamic";

export default async function StaffBadgesPage({
  searchParams,
}: {
  searchParams: { ok?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const token = await getStaffPortalToken();
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const tokenUrl = token && appUrl ? `${appUrl}/portal/staff/${token}` : null;

  return (
    <Shell session={s} active="staff-badges">
      <h1 className="text-2xl font-semibold mb-1">Mitarbeiter-Namensschilder</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Für deine Kollegen, die mehrere Veranstaltungen begleiten. Die Schilder haben
        denselben QR-Code auf der Rückseite, der immer zum <strong>aktuellen Schulungs-Portal</strong>{" "}
        führt (am laufenden Tag automatisch zum richtigen Event; an anderen Tagen können sie
        aus einer Liste wählen). So musst du die Schilder nur einmal drucken.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}

      <div className="card p-4 mb-5 text-sm">
        <div className="font-semibold mb-1">QR-Ziel-URL</div>
        {tokenUrl ? (
          <div className="space-y-2">
            <code className="block text-xs bg-slate-50 border border-slate-200 px-2 py-1.5 rounded break-all font-mono">{tokenUrl}</code>
            <p className="text-xs text-slate-500">
              Diese URL wird in den QR-Codes der Mitarbeiter-Badges hinterlegt. Sie ist nur
              für Kollegen mit Badge erreichbar — die Token-URL ist nicht zu erraten.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Wird beim ersten Badge-PDF automatisch erzeugt.
          </p>
        )}
        <form method="post" action="/api/admin/staff-badges/rotate" className="mt-3">
          <button className="text-xs text-rose-700 hover:underline">
            Token erneuern (alle bisher gedruckten Mitarbeiter-Badges werden ungültig)
          </button>
        </form>
      </div>

      <form method="post" action="/api/admin/staff-badges/pdf" className="card p-4 space-y-3">
        <div>
          <label className="label">Firma (für alle Schilder dieses Drucks)</label>
          <select name="company" className="input text-sm">
            <option value="Flüssigboden Engineering GmbH">Flüssigboden Engineering GmbH</option>
            <option value="Forschungsinstitut für Flüssigboden GmbH">Forschungsinstitut für Flüssigboden GmbH</option>
            <option value="Flüssigboden Akademie UG">Flüssigboden Akademie UG</option>
          </select>
        </div>
        <div>
          <label className="label">Namen (eine Zeile pro Person)</label>
          <textarea
            name="names"
            rows={10}
            required
            placeholder={"Max Mustermann\nAnna Beispiel\nClaudio Tanner | Geschäftsführer"}
            className="input font-mono text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Format: <code>Vorname Nachname</code> — auf dem Schild erscheint die oben
            gewählte Firma. Optional kann pro Zeile mit Pipe-Zeichen <code>|</code> ein
            <strong> abweichender Untertitel</strong> (z. B. „Geschäftsführer") angegeben werden,
            der die Firma für diese Person ersetzt.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Vorlage</label>
            <select name="template" className="input text-sm">
              {BADGE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary text-sm">PDF erzeugen</button>
        </div>
        <p className="text-xs text-slate-500">
          Duplex drucken (Bindung lange Seite) — jede Rückseite trägt einen QR-Code zum
          Portal-Picker. Den QR können die Mitarbeiter scannen, um zur richtigen Schulung
          zu navigieren.
        </p>
      </form>
    </Shell>
  );
}
