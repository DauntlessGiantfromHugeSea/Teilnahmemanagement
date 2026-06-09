import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  const u = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!u) redirect("/login");
  return (
    <Shell session={s} active="">
      <h1 className="text-2xl font-semibold mb-6">Mein Konto</h1>
      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}
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
        <section className="card p-6 md:col-span-2">
          <h2 className="font-semibold mb-2">Digitale Unterschrift</h2>
          <p className="text-xs text-slate-500 mb-3 max-w-xl">
            Wird auf Anmeldebestätigungen u.ä. unter deinem Namen platziert.
            Empfohlen: PNG mit transparentem Hintergrund, ca. 600×200 Pixel.
          </p>
          {u.signatureUrl ? (
            <div className="flex items-center gap-4 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.signatureUrl} alt="Unterschrift" className="h-16 bg-white border border-slate-200 rounded p-2" />
              <form method="post" action="/api/account/signature/delete" className="inline">
                <button className="text-xs text-rose-700 hover:underline">Löschen</button>
              </form>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic mb-3">Keine Unterschrift hinterlegt.</p>
          )}
          <form method="post" action="/api/account/signature" encType="multipart/form-data" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label text-xs">PNG / JPG hochladen</label>
              <input type="file" name="file" accept="image/png,image/jpeg" required className="input text-sm" />
            </div>
            <button className="btn-primary text-sm">Hochladen</button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
