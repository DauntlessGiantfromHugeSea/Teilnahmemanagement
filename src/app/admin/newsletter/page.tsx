import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptSubscriber } from "@/lib/newsletter";
import { mailerConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Ausstehend",
  SUBSCRIBED: "Aktiv",
  UNSUBSCRIBED: "Abgemeldet",
  BOUNCED: "Bounce",
};
const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  SUBSCRIBED: "bg-green-100 text-green-800",
  UNSUBSCRIBED: "bg-slate-100 text-slate-600",
  BOUNCED: "bg-red-100 text-red-700",
};

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; q?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const [counts, subs] = await Promise.all([
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: true }),
    prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const list = subs.map(decryptSubscriber);

  return (
    <Shell session={s} active="newsletter">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Newsletter</h1>
        <div className="flex gap-2">
          <Link href="/admin/newsletter/campaigns" className="btn-secondary">Kampagnen</Link>
          <a href="/api/admin/newsletter/export" className="btn-secondary">CSV-Export</a>
        </div>
      </div>

      {!mailerConfigured() && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          SMTP ist nicht konfiguriert (SMTP_* in der .env fehlt). Es werden keine E-Mails versendet.
        </div>
      )}
      {searchParams.ok && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {searchParams.ok === "test" ? "Test-E-Mail versendet." : "Erledigt."}
        </div>
      )}
      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Aktiv" value={countMap["SUBSCRIBED"] ?? 0} tone="text-green-700" />
        <Kpi label="Ausstehend" value={countMap["PENDING"] ?? 0} tone="text-amber-600" />
        <Kpi label="Abgemeldet" value={countMap["UNSUBSCRIBED"] ?? 0} tone="text-slate-500" />
        <Kpi label="Bounces" value={countMap["BOUNCED"] ?? 0} tone="text-red-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 font-semibold">
            Abonnenten ({list.length})
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>E-Mail</th>
                  <th>Name</th>
                  <th>Quelle</th>
                  <th>Status</th>
                  <th>Seit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((sub) => (
                  <tr key={sub.id}>
                    <td className="font-mono text-xs">{sub.email}</td>
                    <td>{[sub.firstName, sub.lastName].filter(Boolean).join(" ") || "-"}</td>
                    <td className="text-xs">{sub.source}</td>
                    <td>
                      <span className={"badge " + (STATUS_TONE[sub.status] ?? "")}>
                        {STATUS_LABEL[sub.status] ?? sub.status}
                      </span>
                    </td>
                    <td className="text-xs">{sub.createdAt.toLocaleDateString("de-DE")}</td>
                    <td className="text-right whitespace-nowrap">
                      {sub.status === "SUBSCRIBED" && (
                        <form method="post" action={`/api/admin/newsletter/subscribers/${sub.id}/unsubscribe`} className="inline">
                          <button className="text-xs text-slate-500 hover:underline">abmelden</button>
                        </form>
                      )}
                      <form method="post" action={`/api/admin/newsletter/subscribers/${sub.id}/delete`} className="inline ml-2">
                        <button className="text-xs text-red-600 hover:underline">löschen</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-500 py-6">Noch keine Abonnenten.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-3">Abonnent hinzufügen</h2>
            <form method="post" action="/api/admin/newsletter/subscribers" className="space-y-3">
              <div>
                <label className="label">E-Mail *</label>
                <input type="email" name="email" required className="input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Vorname</label>
                  <input name="firstName" className="input" />
                </div>
                <div>
                  <label className="label">Nachname</label>
                  <input name="lastName" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Tags (kommagetrennt)</label>
                <input name="tags" className="input" placeholder="kunde, schulung-2026" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="doubleOptIn" />
                Double-Opt-In-Mail senden (statt direkt aktiv)
              </label>
              <button className="btn-primary w-full">Hinzufügen</button>
            </form>
          </section>

          <section className="card p-6">
            <h2 className="font-semibold mb-3">SMTP testen</h2>
            <form method="post" action="/api/admin/newsletter/test" className="space-y-3">
              <input type="email" name="to" required placeholder="ziel@example.com" className="input" />
              <button className="btn-secondary w-full">Test-E-Mail senden</button>
            </form>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-slate-500 uppercase">{label}</div>
      <div className={"mt-2 text-2xl font-semibold " + tone}>{value}</div>
    </div>
  );
}
