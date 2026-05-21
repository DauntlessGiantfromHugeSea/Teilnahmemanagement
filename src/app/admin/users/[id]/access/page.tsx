import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

export default async function UserAccessPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) notFound();

  const [events, grants] = await Promise.all([
    prisma.event.findMany({
      orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
      include: { training: true },
    }),
    prisma.eventAccess.findMany({ where: { userId: user.id } }),
  ]);

  const grantMap = new Map(grants.map((g) => [g.eventId, g]));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcoming = events.filter((e) => {
    const last = e.day2Date ?? e.day1Date;
    return !last || last >= todayStart;
  });
  const past = events.filter((e) => {
    const last = e.day2Date ?? e.day1Date;
    return last && last < todayStart;
  });

  const isPrivileged = user.role === Role.ADMIN || user.role === Role.ACCOUNTING;

  return (
    <Shell session={s} active="">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Zugriffe von {user.name}</h1>
        <div className="text-sm text-slate-500 mt-1">
          {user.email} &middot; Rolle: <span className="font-medium">{user.role}</span>
        </div>
      </div>

      {searchParams.ok && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Zugriffe aktualisiert.
        </div>
      )}

      {isPrivileged ? (
        <div className="card p-6 mb-6 border-l-4 border-brand-500">
          <p className="text-sm text-slate-700">
            <strong>{user.role === Role.ADMIN ? "Admins" : "Buchhaltung"}</strong> sehen
            automatisch alle Veranstaltungen. Eine einzelne Zuweisung ist hier nicht noetig.
          </p>
        </div>
      ) : (
        <form method="post" action={`/api/admin/users/${user.id}/access`} className="space-y-6">
          <AccessSection
            title="Aktuell & kommend"
            events={upcoming}
            grants={grantMap}
          />
          <details className="card overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 hover:bg-slate-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Archiv ({past.length})
              </span>
              <span aria-hidden className="text-slate-400 text-sm">&#9662;</span>
            </summary>
            <div className="border-t border-slate-200 p-4">
              <AccessSection title="" events={past} grants={grantMap} bare />
            </div>
          </details>
          <div className="flex gap-2">
            <button className="btn-primary">Speichern</button>
            <a href="/admin/users" className="btn-secondary">Zurueck</a>
          </div>
        </form>
      )}
    </Shell>
  );
}

function AccessSection({
  title,
  events,
  grants,
  bare,
}: {
  title: string;
  events: { id: string; title: string; format: string; training: { title: string }; day1Date: Date | null }[];
  grants: Map<string, { canWrite: boolean }>;
  bare?: boolean;
}) {
  const body = (
    <table className="table">
      <thead>
        <tr>
          <th>Veranstaltung</th>
          <th>Termin</th>
          <th className="text-center">Sehen</th>
          <th className="text-center">Schreiben</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => {
          const g = grants.get(e.id);
          return (
            <tr key={e.id}>
              <td>
                <div className="font-medium">{e.title}</div>
                <div className="text-xs text-slate-500">{e.training.title}</div>
              </td>
              <td className="text-sm">
                {e.day1Date ? e.day1Date.toLocaleDateString("de-DE") : "-"}
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  name={`view_${e.id}`}
                  defaultChecked={!!g}
                  className="h-4 w-4 accent-brand-500"
                />
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  name={`write_${e.id}`}
                  defaultChecked={g?.canWrite ?? false}
                  className="h-4 w-4 accent-brand-500"
                />
              </td>
            </tr>
          );
        })}
        {events.length === 0 && (
          <tr>
            <td colSpan={4} className="text-center text-slate-500 py-6">
              Keine Veranstaltungen.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  if (bare) return body;
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-slate-500">{events.length}</span>
      </div>
      <div className="card overflow-hidden">{body}</div>
    </section>
  );
}
