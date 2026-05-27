import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const activeCount = await prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED" } });

  return (
    <Shell session={s} active="newsletter">
      <h1 className="text-2xl font-semibold mb-2">Neue Kampagne</h1>
      <p className="text-sm text-slate-500 mb-6">
        Aktuell {activeCount} aktive Abonnenten. Platzhalter im HTML: <code>{"{{firstName}}"}</code>,{" "}
        <code>{"{{lastName}}"}</code>, <code>{"{{unsubscribe}}"}</code> (Abmelde-Link).
      </p>
      <div className="card p-6 max-w-3xl">
        <form method="post" action="/api/admin/newsletter/campaigns" className="space-y-4">
          <div>
            <label className="label">Betreff *</label>
            <input name="subject" required className="input" />
          </div>
          <div>
            <label className="label">Tags-Filter (kommagetrennt, leer = alle aktiven)</label>
            <input name="tagFilter" className="input" placeholder="z.B. kunde" />
          </div>
          <div>
            <label className="label">HTML-Inhalt *</label>
            <textarea
              name="bodyHtml"
              required
              rows={14}
              className="input font-mono text-xs"
              defaultValue={`<h1>Überschrift</h1>
<p>Hallo {{firstName}},</p>
<p>hier steht der Inhalt des Newsletters.</p>
<p style="margin-top:24px;color:#64748b;font-size:12px;">
  Abmelden: <a href="{{unsubscribe}}">Newsletter abbestellen</a>
</p>`}
            />
          </div>
          <p className="text-xs text-slate-500">
            Der Inhalt wird automatisch in das FB-Akademie-Layout (Logo, Footer) eingebettet.
            Ein Abmelde-Link wird im Footer ergänzt; du kannst zusätzlich <code>{"{{unsubscribe}}"}</code> verwenden.
          </p>
          <div className="flex gap-2">
            <button name="action" value="draft" className="btn-secondary">Als Entwurf speichern</button>
            <button name="action" value="send" className="btn-primary">Speichern &amp; jetzt senden</button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
