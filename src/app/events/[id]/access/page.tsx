import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export default async function AccessPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect(`/events/${params.id}`);
  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) notFound();
  const [grants, users] = await Promise.all([
    prisma.eventAccess.findMany({ where: { eventId: ev.id }, include: { user: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const grantedIds = new Set(grants.map((g) => g.userId));
  const candidates = users.filter((u) => !grantedIds.has(u.id) && u.role !== "ADMIN" && u.role !== "ACCOUNTING");
  return (
    <Shell session={s} active="events">
      <h1 className="text-2xl font-semibold mb-2">Zugriffe verwalten</h1>
      <p className="text-sm text-slate-500 mb-6">
        Veranstaltung: <strong>{ev.title}</strong>
        <br />
        Admins und die Buchhaltung sehen alle Veranstaltungen automatisch.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="card p-6">
          <h2 className="font-semibold mb-3">Bestehende Zugriffe</h2>
          {grants.length === 0 ? (
            <p className="text-sm text-slate-500">Keine User freigegeben.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {grants.map((g) => (
                <li key={g.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{g.user.name}</div>
                    <div className="text-xs text-slate-500">{g.user.email} &middot; {g.user.role}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className={"badge " + (g.canWrite ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600")}>
                      {g.canWrite ? "Schreiben" : "Lesen"}
                    </span>
                    <form method="post" action={`/api/events/${ev.id}/access/${g.id}/toggle`}>
                      <button className="btn-secondary text-xs">umschalten</button>
                    </form>
                    <form method="post" action={`/api/events/${ev.id}/access/${g.id}/revoke`}>
                      <button className="btn-danger text-xs">entfernen</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <h2 className="font-semibold mb-3">Zugriff erteilen</h2>
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500">Keine weiteren User verfuegbar.</p>
          ) : (
            <form method="post" action={`/api/events/${ev.id}/access`} className="space-y-3">
              <div>
                <label className="label">User</label>
                <select name="userId" className="input" required>
                  <option value="" disabled>Bitte waehlen</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) - {u.role}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="canWrite" />
                Schreibrechte
              </label>
              <button className="btn-primary">Freigeben</button>
            </form>
          )}
        </section>
      </div>
    </Shell>
  );
}
