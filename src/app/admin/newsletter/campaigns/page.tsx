import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Entwurf",
  SENDING: "Wird gesendet",
  SENT: "Gesendet",
  FAILED: "Fehlgeschlagen",
};
const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENDING: "bg-blue-100 text-blue-800",
  SENT: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-700",
};

export default async function CampaignsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <Shell session={s} active="newsletter">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Newsletter-Kampagnen</h1>
        <Link href="/admin/newsletter/campaigns/new" className="btn-primary">Neue Kampagne</Link>
      </div>

      {searchParams.ok && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {decodeURIComponent(searchParams.ok)}
        </div>
      )}
      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Betreff</th>
              <th>Status</th>
              <th>Empfänger</th>
              <th>Gesendet</th>
              <th>Fehler</th>
              <th>Datum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.subject}</td>
                <td><span className={"badge " + (STATUS_TONE[c.status] ?? "")}>{STATUS_LABEL[c.status]}</span></td>
                <td>{c.recipientCount}</td>
                <td>{c.sentCount}</td>
                <td>{c.failedCount > 0 ? <span className="text-red-600">{c.failedCount}</span> : "-"}</td>
                <td className="text-xs">{(c.sentAt ?? c.createdAt).toLocaleString("de-DE")}</td>
                <td className="text-right">
                  {c.status === "DRAFT" && (
                    <Link href={`/admin/newsletter/campaigns/${c.id}`} className="text-brand-700 hover:underline text-sm">bearbeiten</Link>
                  )}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-6">Noch keine Kampagnen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
