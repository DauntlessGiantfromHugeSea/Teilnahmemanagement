import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const c = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!c) notFound();
  if (c.status !== "DRAFT") redirect("/admin/newsletter/campaigns");
  const activeCount = await prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED" } });
  const tagFilter = c.tagFilter ? (JSON.parse(c.tagFilter) as string[]).join(", ") : "";

  return (
    <Shell session={s} active="newsletter">
      <h1 className="text-2xl font-semibold mb-2">Kampagne bearbeiten</h1>
      <p className="text-sm text-slate-500 mb-6">{activeCount} aktive Abonnenten.</p>
      <div className="card p-6 max-w-3xl">
        <form method="post" action={`/api/admin/newsletter/campaigns/${c.id}`} className="space-y-4">
          <div>
            <label className="label">Betreff *</label>
            <input name="subject" required defaultValue={c.subject} className="input" />
          </div>
          <div>
            <label className="label">Tags-Filter (kommagetrennt, leer = alle aktiven)</label>
            <input name="tagFilter" defaultValue={tagFilter} className="input" />
          </div>
          <div>
            <label className="label">HTML-Inhalt *</label>
            <textarea name="bodyHtml" required rows={14} className="input font-mono text-xs" defaultValue={c.bodyHtml} />
          </div>
          <div className="flex gap-2">
            <button name="action" value="draft" className="btn-secondary">Speichern</button>
            <button name="action" value="send" className="btn-primary">Speichern &amp; jetzt senden</button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
