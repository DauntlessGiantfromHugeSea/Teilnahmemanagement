import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { BADGE_TEMPLATES } from "@/lib/badgeTemplates";
import { getStaffPortalToken } from "@/lib/staffPortalToken";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const COMPANIES = [
  "Flüssigboden Engineering GmbH",
  "Forschungsinstitut für Flüssigboden GmbH",
  "Flüssigboden Akademie UG",
];

export default async function StaffBadgesPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const token = await getStaffPortalToken();
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const tokenUrl = token && appUrl ? `${appUrl}/portal/staff/${token}` : null;

  const staff = await prisma.staff.findMany({
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
  // Events fuers Mitarbeiter-Portal: zukuenftige + heute laufende
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const events = await prisma.event.findMany({
    where: {
      cancelled: false,
      OR: [
        { day1Date: { gte: today0 } },
        { day2Date: { gte: today0 } },
        { day1Date: null },
      ],
    },
    orderBy: { day1Date: "asc" },
  });

  return (
    <Shell session={s} active="staff-badges">
      <h1 className="text-2xl font-semibold mb-1">Mitarbeiter &amp; Namensschilder</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Mitarbeiter werden einmal hier angelegt und können beliebig oft als Namensschild
        gedruckt werden. Die Rückseite trägt den QR zum Schulungs-Portal — eine Karte ist also
        dauerhaft nutzbar.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <div className="card p-4 mb-5 text-sm">
        <div className="font-semibold mb-1">QR-Ziel-URL</div>
        {tokenUrl ? (
          <code className="block text-xs bg-slate-50 border border-slate-200 px-2 py-1.5 rounded break-all font-mono">{tokenUrl}</code>
        ) : (
          <p className="text-xs text-slate-500">Wird beim ersten Badge-PDF automatisch erzeugt.</p>
        )}
        <form method="post" action="/api/admin/staff-badges/rotate" className="mt-3">
          <button className="text-xs text-rose-700 hover:underline">
            Token erneuern (alle bereits gedruckten Badges werden ungültig)
          </button>
        </form>
      </div>

      {/* Veranstaltungs-Auswahl fuer Mitarbeiter-Portal */}
      <div className="card p-4 mb-6">
        <h2 className="font-semibold mb-1">Veranstaltungen im Mitarbeiter-Portal</h2>
        <p className="text-xs text-slate-500 mb-3">
          Markiere die Schulungen, die deine Kollegen sehen sollen, wenn sie den
          QR-Code auf ihrem Badge scannen. Nur diese erscheinen in der Picker-Liste.
        </p>
        {events.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Keine anstehenden Schulungen.</p>
        ) : (
          <form method="post" action="/api/admin/staff-badges/portal-events" className="space-y-2">
            <div className="space-y-1 max-h-80 overflow-auto pr-1">
              {events.map((ev) => (
                <label key={ev.id} className="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-2 py-1.5">
                  <input
                    type="checkbox"
                    name="eventIds"
                    value={ev.id}
                    defaultChecked={ev.showInStaffPortal}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span className="flex-1">
                    <span className="font-medium">{ev.title}</span>
                    <span className="block text-xs text-slate-500 font-mono">
                      {ev.day1Date ? new Date(ev.day1Date).toLocaleDateString("de-DE") : "—"}
                      {ev.day2Date ? ` – ${new Date(ev.day2Date).toLocaleDateString("de-DE")}` : ""}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <button className="btn-primary text-sm">Auswahl speichern</button>
          </form>
        )}
      </div>

      {/* Drucken */}
      <div className="card p-4 mb-6">
        <h2 className="font-semibold mb-2">Namensschilder drucken</h2>
        <form method="post" action="/api/admin/staff-badges/pdf" className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_220px] gap-3 items-end">
            <div>
              <label className="label">Wer soll gedruckt werden?</label>
              <select name="scope" className="input text-sm">
                <option value="active">Alle aktiven Mitarbeiter ({staff.filter((x) => x.active).length})</option>
                <option value="all">Alle Mitarbeiter (inkl. archivierter) ({staff.length})</option>
              </select>
            </div>
            <div>
              <label className="label">HERMA-Vorlage</label>
              <select name="template" className="input text-sm">
                {BADGE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary text-sm">PDF erzeugen (duplex drucken, Bindung lange Seite)</button>
        </form>
      </div>

      {/* Liste */}
      <h2 className="text-lg font-semibold mb-2">Mitarbeiter</h2>
      <div className="card overflow-hidden mb-4">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Firma / Position</th>
              <th>Status</th>
              <th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((m) => (
              <tr key={m.id} className={m.active ? "" : "text-slate-400"}>
                <td className="py-3">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className="font-medium">{m.lastName}, {m.firstName}</span>
                    </summary>
                    <form method="post" action={`/api/admin/staff-badges/update`} className="mt-2 grid sm:grid-cols-2 gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <input name="firstName" defaultValue={m.firstName} required className="input text-sm" placeholder="Vorname" />
                      <input name="lastName" defaultValue={m.lastName} required className="input text-sm" placeholder="Nachname" />
                      <select name="company" defaultValue={m.company} className="input text-sm">
                        {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input name="subtitle" defaultValue={m.subtitle ?? ""} className="input text-sm" placeholder="Optional: Untertitel statt Firma" />
                      <div className="sm:col-span-2 flex gap-2">
                        <button className="btn-primary text-xs">Speichern</button>
                      </div>
                    </form>
                  </details>
                </td>
                <td className="text-sm">
                  <div>{m.company}</div>
                  {m.subtitle && <div className="text-xs text-slate-500">→ {m.subtitle}</div>}
                </td>
                <td>
                  {m.active ? (
                    <span className="badge bg-emerald-100 text-emerald-700">aktiv</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-500">archiviert</span>
                  )}
                </td>
                <td className="text-right text-xs space-x-3 whitespace-nowrap">
                  <form method="post" action="/api/admin/staff-badges/pdf" className="inline">
                    <input type="hidden" name="staffId" value={m.id} />
                    <button className="text-brand-700 hover:underline">PDF</button>
                  </form>
                  <form method="post" action="/api/admin/staff-badges/toggle" className="inline">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="text-slate-600 hover:text-brand-700">
                      {m.active ? "archivieren" : "aktivieren"}
                    </button>
                  </form>
                  <form method="post" action="/api/admin/staff-badges/delete" className="inline">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="text-rose-700 hover:underline">löschen</button>
                  </form>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-500 py-6 italic">Noch keine Mitarbeiter angelegt.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm text-brand-700 hover:underline">+ Mitarbeiter anlegen</summary>
        <form method="post" action="/api/admin/staff-badges/create" className="mt-3 grid sm:grid-cols-2 gap-3">
          <input name="firstName" required placeholder="Vorname" className="input text-sm" />
          <input name="lastName" required placeholder="Nachname" className="input text-sm" />
          <select name="company" className="input text-sm">
            {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="subtitle" placeholder="Optional: Untertitel statt Firma (z. B. Geschäftsführer)" className="input text-sm" />
          <div className="sm:col-span-2">
            <button className="btn-primary text-sm">Anlegen</button>
          </div>
        </form>
      </details>
    </Shell>
  );
}
