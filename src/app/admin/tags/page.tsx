import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ensureDefaultTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

export default async function TagsAdminPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  await ensureDefaultTags();
  const tags = await prisma.tag.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { participants: true } } },
  });

  return (
    <Shell session={s} active="tags">
      <h1 className="text-2xl font-semibold mb-1">Tags / Kategorien</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Tags klassifizieren Teilnehmer (Planer, Baufirma, …). Sie können pro Teilnehmer
        manuell vergeben werden. Wenn ein neuer Teilnehmer einer Firma anlegt wird, deren
        andere Teilnehmer schon Tags haben, übernimmt das System diese automatisch.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <div className="card overflow-hidden mb-5">
        <table className="table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Farbe</th>
              <th>Position</th>
              <th>Teilnehmer</th>
              <th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id} className="align-top text-sm">
                <td className="py-3">
                  <span
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold"
                    style={{ background: (t.color ?? "#94a3b8") + "22", color: t.color ?? "#475569" }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "#94a3b8" }} />
                    {t.name}
                  </span>
                </td>
                <td>
                  <form method="post" action="/api/admin/tags/update" className="flex items-center gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      name="color"
                      defaultValue={t.color ?? "#0f766e"}
                      type="color"
                      className="h-7 w-12 cursor-pointer rounded border border-slate-200"
                    />
                    <input name="name" defaultValue={t.name} className="input text-sm w-48" />
                    <input name="position" type="number" defaultValue={t.position} className="input text-sm w-16" />
                    <button className="text-xs text-brand-700 hover:underline">Speichern</button>
                  </form>
                </td>
                <td className="text-xs text-slate-500">{t.position}</td>
                <td className="text-xs text-slate-500">{t._count.participants}</td>
                <td className="text-right text-xs">
                  <form method="post" action="/api/admin/tags/delete" className="inline">
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-rose-700 hover:underline">löschen</button>
                  </form>
                </td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-500 py-6 italic">Noch keine Tags angelegt.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="card p-4 mb-5">
        <summary className="cursor-pointer text-sm text-brand-700 hover:underline">+ Neuen Tag anlegen</summary>
        <form method="post" action="/api/admin/tags/create" className="mt-3 grid sm:grid-cols-[1fr_80px_100px_auto] gap-2 items-end">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input text-sm" />
          </div>
          <div>
            <label className="label">Farbe</label>
            <input name="color" type="color" defaultValue="#0f766e" className="h-9 w-full cursor-pointer rounded border border-slate-200" />
          </div>
          <div>
            <label className="label">Position</label>
            <input name="position" type="number" defaultValue={(tags.length + 1) * 10} className="input text-sm" />
          </div>
          <button className="btn-primary text-sm">Anlegen</button>
        </form>
      </details>

      <form method="post" action="/api/admin/tags/repropagate" className="text-right">
        <button className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
          ♻ Auto-Tags neu anwenden (alle Teilnehmer nach Firma abgleichen)
        </button>
      </form>
    </Shell>
  );
}
