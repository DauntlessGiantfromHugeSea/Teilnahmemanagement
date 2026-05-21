import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <Shell session={s} active="users">
      <h1 className="text-2xl font-semibold mb-6">Benutzer</h1>
      {searchParams.ok && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">Erledigt.</div>
      )}
      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{searchParams.error}</div>
      )}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>2FA</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="font-mono text-xs">{u.email}</td>
                  <td>
                    <form method="post" action={`/api/admin/users/${u.id}/role`} className="flex gap-1">
                      <select name="role" defaultValue={u.role} className="input py-1 text-xs">
                        {Object.values(Role).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button className="btn-secondary text-xs">OK</button>
                    </form>
                  </td>
                  <td>
                    {u.totpEnabled ? (
                      <span className="badge bg-green-100 text-green-800">aktiv</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-800">inaktiv</span>
                    )}
                  </td>
                  <td>
                    {u.active ? (
                      <span className="badge bg-slate-100 text-slate-700">aktiv</span>
                    ) : (
                      <span className="badge bg-red-100 text-red-700">deaktiviert</span>
                    )}
                  </td>
                  <td className="text-right space-x-1">
                    <form method="post" action={`/api/admin/users/${u.id}/toggle`} className="inline">
                      <button className="btn-secondary text-xs">{u.active ? "Deaktivieren" : "Aktivieren"}</button>
                    </form>
                    <form method="post" action={`/api/admin/users/${u.id}/reset2fa`} className="inline">
                      <button className="btn-secondary text-xs">2FA zuruecksetzen</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-3">Neuen Benutzer anlegen</h2>
          <form method="post" action="/api/admin/users" className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input type="email" name="email" required className="input" />
            </div>
            <div>
              <label className="label">Initial-Passwort (min. 10 Zeichen)</label>
              <input name="password" required minLength={10} className="input" />
            </div>
            <div>
              <label className="label">Rolle</label>
              <select name="role" defaultValue="VIEWER" className="input">
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary w-full">Anlegen</button>
            <p className="text-xs text-slate-500">
              Der User muss beim ersten Login 2FA einrichten.
            </p>
          </form>
        </div>
      </div>
    </Shell>
  );
}
