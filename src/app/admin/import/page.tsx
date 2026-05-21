import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: { result?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const events = await prisma.event.findMany({
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { training: true },
  });

  let result: any = null;
  if (searchParams.result) {
    try {
      result = JSON.parse(Buffer.from(searchParams.result, "base64url").toString("utf8"));
    } catch {
      result = null;
    }
  }

  return (
    <Shell session={s} active="">
      <h1 className="text-2xl font-semibold mb-6">Anmeldungen importieren</h1>

      {result && (
        <div className="mb-6 card p-4">
          <div className="font-semibold mb-2">Ergebnis</div>
          <div className="text-sm text-slate-700">
            Gesamt: {result.total} &middot; Angelegt:{" "}
            <span className="font-semibold text-green-700">{result.created}</span> &middot;
            Uebersprungen: <span className="font-semibold text-slate-600">{result.skipped}</span>{" "}
            &middot; Fehler:{" "}
            <span className="font-semibold text-red-700">{result.failed}</span>
          </div>
          {Array.isArray(result.results) && result.results.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-brand-700 cursor-pointer">Details ein-/ausklappen</summary>
              <table className="table mt-3">
                <thead>
                  <tr>
                    <th>Zeile</th>
                    <th>Status</th>
                    <th>Meldung</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r: any, idx: number) => (
                    <tr key={idx}>
                      <td>{r.row}</td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (r.ok
                              ? r.message.includes("Bereits")
                                ? "bg-slate-100 text-slate-600"
                                : "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800")
                          }
                        >
                          {r.ok ? (r.message.includes("Bereits") ? "übersprungen" : "ok") : "fehler"}
                        </span>
                      </td>
                      <td className="text-sm">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <section className="card p-6">
          <h2 className="font-semibold mb-2">Anmeldungen (Format mit Schulungsangabe)</h2>
          <p className="text-xs text-slate-500 mb-4">
            CSV-Export aus dem Anmeldeformular der Website. Erwartete Spalten:
            <br />
            <code className="text-[11px]">
              participant-name, company-name, participant-email, phone-number, training-date,
              billing-company-name, billing-name, billing-street, billing-zipcode-city,
              billing-email, remarks, …
            </code>
            <br />
            <br />
            Events werden automatisch nach der ID aus <code>training-date</code> (z.B. <code>#260603</code>)
            angelegt oder erkannt. Doppelte Anmeldungen (gleiche E-Mail im selben Event) werden übersprungen.
          </p>
          <form method="post" action="/api/admin/import" encType="multipart/form-data" className="space-y-3">
            <input type="hidden" name="mode" value="anmeldungen" />
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <button className="btn-primary">Importieren</button>
          </form>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold mb-2">Kontakte (Format ohne Schulungsangabe)</h2>
          <p className="text-xs text-slate-500 mb-4">
            Einfaches Format mit Stammdaten. Da keine Schulungsangabe enthalten ist, musst du das
            Ziel-Event hier auswählen. Erwartete Spalten:
            <br />
            <code className="text-[11px]">
              nachname-vorname, firma, straße, plz, ort, telefon, email, email-rechnung,
              kostenstelle, …
            </code>
          </p>
          <form method="post" action="/api/admin/import" encType="multipart/form-data" className="space-y-3">
            <input type="hidden" name="mode" value="kontakte" />
            <div>
              <label className="label">Ziel-Event</label>
              <select name="eventId" required className="input">
                <option value="" disabled>Bitte wählen</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.training.title}
                    {e.day1Date ? `, ${e.day1Date.toLocaleDateString("de-DE")}` : ""})
                  </option>
                ))}
              </select>
            </div>
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <button className="btn-primary">Importieren</button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
