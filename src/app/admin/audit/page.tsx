import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export default async function AuditPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { actor: true },
  });
  return (
    <Shell session={s} active="audit">
      <h1 className="text-2xl font-semibold mb-6">Verlauf (global)</h1>
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Akteur</th>
              <th>Aktion</th>
              <th>Entität</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="text-xs whitespace-nowrap">{e.createdAt.toLocaleString("de-DE")}</td>
                <td>{e.actor?.name ?? <span className="text-slate-400">System</span>}</td>
                <td className="font-mono text-xs">{e.action}</td>
                <td>{e.entityType}</td>
                <td className="font-mono text-xs">{e.entityId ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
