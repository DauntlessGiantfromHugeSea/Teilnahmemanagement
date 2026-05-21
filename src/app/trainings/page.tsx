import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { canWriteGlobal } from "@/lib/rbac";
import { formatEUR } from "@/lib/pricing";

export default async function TrainingsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");
  const trainings = await prisma.training.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <Shell session={s} active="trainings">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Schulungen</h1>
        <Link href="/trainings/new" className="btn-primary">Neue Schulung</Link>
      </div>
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Tag 1</th>
              <th>Tag 2</th>
              <th>Beide Tage</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trainings.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{t.title}</td>
                <td>{formatEUR(t.priceDay1)}</td>
                <td>{formatEUR(t.priceDay2)}</td>
                <td>{formatEUR(t.priceBoth)}</td>
                <td>
                  {t.active ? (
                    <span className="badge bg-green-100 text-green-800">aktiv</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-600">inaktiv</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/trainings/${t.id}`} className="text-brand-700 hover:underline text-sm">bearbeiten</Link>
                </td>
              </tr>
            ))}
            {trainings.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-500 py-6">Noch keine Schulungen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
