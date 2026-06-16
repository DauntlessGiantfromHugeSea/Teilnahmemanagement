import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteGlobal } from "@/lib/rbac";

export default async function BriefPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");

  const today = new Date().toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <Shell session={s} active="admin">
      <h1 className="text-2xl font-semibold mb-2">Brief auf Briefpapier</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Erzeugt ein druckbares PDF auf dem FBA-Briefpapier. Kein Mailversand —
        nur zum Ausdrucken. Felder leer lassen, was nicht erscheinen soll.
      </p>

      <form method="post" action="/api/admin/brief" target="_blank" className="card p-6 max-w-2xl space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Empfänger (mehrzeilig)</label>
            <textarea
              name="recipient"
              rows={4}
              placeholder={"Firma Mustermann GmbH\nMax Mustermann\nMusterstraße 1\n04109 Leipzig"}
              className="input text-sm"
            />
          </div>
          <div>
            <label className="label">Datum</label>
            <input name="date" defaultValue={`Leipzig, ${today}`} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Betreff</label>
          <input name="subject" placeholder="Betreffzeile" className="input" />
        </div>

        <div>
          <label className="label">Anrede</label>
          <input name="salutation" defaultValue="Sehr geehrte Damen und Herren," className="input" />
        </div>

        <div>
          <label className="label">Brieftext *</label>
          <textarea
            name="body"
            rows={14}
            required
            placeholder="Ihr Brieftext …"
            className="input text-sm"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Grußformel</label>
            <input name="closing" defaultValue="Mit freundlichen Grüßen" className="input" />
          </div>
          <div>
            <label className="label">Unterzeichner (Name)</label>
            <input name="signerName" defaultValue={s.name} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Position / Rolle</label>
          <input name="signerRole" placeholder="z. B. Geschäftsführer" className="input" />
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn-primary">📄 Brief als PDF erzeugen</button>
        </div>
      </form>
    </Shell>
  );
}
