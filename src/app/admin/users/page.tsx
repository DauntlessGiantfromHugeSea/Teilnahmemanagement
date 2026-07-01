import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; link?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <Shell session={s} active="users">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Benutzer</h1>
          <p className="text-sm text-slate-500 mt-1">
            {users.length} Konto{users.length === 1 ? "" : "s"} – Rollen, Zugriffe und 2FA verwalten.
          </p>
        </div>
      </div>

      {searchParams.ok && (
        <div className="toast-ok mb-4">
          <span aria-hidden>✓</span>
          <span>{searchParams.ok}</span>
        </div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4">
          <span aria-hidden>!</span>
          <span>{searchParams.error}</span>
        </div>
      )}
      {searchParams.link && (
        <div className="toast-warn mb-4 flex-col items-stretch">
          <div className="font-semibold">Link manuell weitergeben:</div>
          <div className="font-mono text-xs break-all mt-1">{searchParams.link}</div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Liste */}
        <div className="lg:col-span-2 card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Rolle</th>
                  <th>2FA</th>
                  <th>Status</th>
                  <th className="text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                    </td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-700">{u.role}</span>
                    </td>
                    <td>
                      {u.totpEnabled || u.emailCodeEnabled ? (
                        <span className="badge bg-emerald-50 text-emerald-700">
                          {u.totpEnabled ? "TOTP" : "E-Mail"}
                        </span>
                      ) : u.totpRequired ? (
                        <span
                          className="badge bg-amber-50 text-amber-700"
                          title="Pflicht, aber noch nicht eingerichtet"
                        >
                          Pflicht
                        </span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-600">aus</span>
                      )}
                    </td>
                    <td>
                      {u.active ? (
                        <span className="badge bg-slate-100 text-slate-700">aktiv</span>
                      ) : (
                        <span className="badge bg-rose-50 text-rose-700">deaktiviert</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {u.id !== s.uid && u.active && (
                        <form
                          method="post"
                          action={`/api/admin/users/${u.id}/impersonate`}
                          className="inline-block mr-1"
                        >
                          <button
                            className="btn-row"
                            title="Als diesen Benutzer anmelden (Support-Modus)"
                          >
                            👤 Support
                          </button>
                        </form>
                      )}
                      <Link href={`/admin/users/${u.id}/edit`} className="btn-row">
                        Bearbeiten
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* Einladung */}
        <div className="card p-6">
          <h2 className="font-semibold mb-1">Neuen Benutzer einladen</h2>
          <p className="text-xs text-slate-500 mb-4">
            Der Nutzer erhält per E-Mail einen Link, über den er ein Passwort setzt (gültig 14 Tage).
            Beim ersten Login muss 2FA eingerichtet werden.
          </p>
          <form method="post" action="/api/admin/users/invite" className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input type="email" name="email" required className="input" />
            </div>
            <div>
              <label className="label">Rolle</label>
              <select name="role" defaultValue="VIEWER" className="input">
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary w-full">Einladung senden</button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
