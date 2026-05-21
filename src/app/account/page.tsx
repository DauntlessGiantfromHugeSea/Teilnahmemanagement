import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";

export default async function AccountPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const u = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!u) redirect("/login");
  return (
    <Shell session={s} active="">
      <h1 className="text-2xl font-semibold mb-6">Mein Konto</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-6">
          <h2 className="font-semibold mb-2">Profil</h2>
          <div className="text-sm space-y-1">
            <div><span className="text-slate-500">Name:</span> {u.name}</div>
            <div><span className="text-slate-500">E-Mail:</span> {u.email}</div>
            <div><span className="text-slate-500">Rolle:</span> {u.role}</div>
            <div><span className="text-slate-500">Letzter Login:</span> {u.lastLoginAt?.toLocaleString("de-DE") ?? "-"}</div>
          </div>
        </section>
        <section className="card p-6">
          <h2 className="font-semibold mb-2">Sicherheit</h2>
          <div className="text-sm mb-3">
            2FA-Status:{" "}
            {u.totpEnabled ? (
              <span className="badge bg-green-100 text-green-800">Aktiv</span>
            ) : (
              <span className="badge bg-yellow-100 text-yellow-800">Inaktiv</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/account/2fa/setup" className="btn-secondary">
              {u.totpEnabled ? "2FA neu einrichten" : "2FA einrichten"}
            </a>
            <a href="/account/password" className="btn-secondary">Passwort aendern</a>
          </div>
        </section>
      </div>
    </Shell>
  );
}
