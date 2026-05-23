/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { listMedia, formatBytes } from "@/lib/mediaList";

export const dynamic = "force-dynamic";

export default async function MediaPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; url?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const media = await listMedia();
  const totalBytes = media.reduce((sum, m) => sum + m.size, 0);

  return (
    <Shell session={s} active="">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Media-Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            {media.length} Datei{media.length === 1 ? "" : "en"} · {formatBytes(totalBytes)} gesamt
          </p>
        </div>
      </div>

      {searchParams.ok && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          {searchParams.ok === "uploaded" ? (
            <>Hochgeladen{searchParams.url ? `: ${searchParams.url}` : "."}</>
          ) : searchParams.ok === "deleted" ? (
            "Datei gelöscht."
          ) : (
            "Erledigt."
          )}
        </div>
      )}
      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <section className="card p-5 mb-6">
        <h2 className="font-semibold mb-3">Neue Datei hochladen</h2>
        <form
          method="post"
          action="/api/admin/media/upload"
          encType="multipart/form-data"
          className="flex flex-col sm:flex-row gap-3 sm:items-center"
        >
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            required
            className="input flex-1"
          />
          <button className="btn-primary">Hochladen</button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          JPEG, PNG, WEBP, GIF oder SVG. Max. 8 MB pro Datei. Mehrere Dateien?
          Einzeln hochladen oder Drag &amp; Drop nutzen.
        </p>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Dateien</h2>
        {media.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            Noch keine Dateien hochgeladen.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {media.map((m) => (
              <div key={m.url} className="card overflow-hidden">
                <div className="aspect-video bg-slate-100 flex items-center justify-center">
                  <img
                    src={m.url}
                    alt={m.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="p-3 space-y-2">
                  <div className="text-xs font-mono break-all line-clamp-2" title={m.name}>
                    {m.name}
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between gap-2">
                    <span>{formatBytes(m.size)}</span>
                    <span>{m.modifiedAt.toLocaleDateString("de-DE")}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary text-[11px] py-1 px-2"
                    >
                      Ansehen
                    </a>
                    <a
                      href={m.url}
                      download={m.name}
                      className="btn-secondary text-[11px] py-1 px-2"
                    >
                      Download
                    </a>
                    <form
                      method="post"
                      action="/api/admin/media/delete"
                      className="inline"
                    >
                      <input type="hidden" name="url" value={m.url} />
                      <button className="btn-secondary text-[11px] py-1 px-2 hover:text-red-700 hover:border-red-300">
                        Löschen
                      </button>
                    </form>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono break-all">
                    {m.url}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
