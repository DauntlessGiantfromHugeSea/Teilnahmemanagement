import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { parseCertificateData } from "@/lib/certificates";

export const dynamic = "force-dynamic";

export default async function ZertifikatPruefungenPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const onlyUnseen = searchParams.filter === "unseen";

  const [views, totalUnseen, totalAll] = await Promise.all([
    prisma.certificateView.findMany({
      where: onlyUnseen ? { seenAt: null } : {},
      orderBy: { viewedAt: "desc" },
      take: 200,
      include: { certificate: true },
    }),
    prisma.certificateView.count({ where: { seenAt: null } }),
    prisma.certificateView.count(),
  ]);

  // Pro Zertifikat Aufrufe zusammenfassen (fuer die Uebersicht ganz oben)
  const byCert = new Map<
    string,
    { number: string; slug: string; name: string; count: number; unseen: number; last: Date }
  >();
  for (const v of views) {
    const key = v.certificateId;
    const d = parseCertificateData(v.certificate.data);
    const name = [d.firstName, d.lastName].filter(Boolean).join(" ") || "(ohne Name)";
    const cur = byCert.get(key);
    if (cur) {
      cur.count++;
      if (!v.seenAt) cur.unseen++;
      if (v.viewedAt > cur.last) cur.last = v.viewedAt;
    } else {
      byCert.set(key, {
        number: v.certificate.number,
        slug: v.certificate.slug,
        name,
        count: 1,
        unseen: v.seenAt ? 0 : 1,
        last: v.viewedAt,
      });
    }
  }
  const perCert = [...byCert.values()].sort((a, b) => b.last.getTime() - a.last.getTime());

  return (
    <Shell session={s} active="">
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
          ← Zurück zum Dashboard
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Zertifikat-Prüfungen</h1>
        <div className="text-sm text-slate-500">
          <span className="font-semibold text-brand-700">{totalUnseen}</span> ungesehen ·{" "}
          <span className="font-semibold text-slate-500">{totalAll}</span> gesamt
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Link
          href="/admin/zertifikat-pruefungen"
          className={"btn-secondary text-xs " + (!onlyUnseen ? "!bg-brand-100 !text-brand-700" : "")}
        >
          Alle
        </Link>
        <Link
          href="/admin/zertifikat-pruefungen?filter=unseen"
          className={"btn-secondary text-xs " + (onlyUnseen ? "!bg-brand-100 !text-brand-700" : "")}
        >
          Nur ungesehen ({totalUnseen})
        </Link>
        {totalUnseen > 0 && (
          <form method="post" action="/api/admin/certificate-views/mark-seen" className="ml-auto">
            <button className="btn-secondary text-xs">Alle als gesehen markieren</button>
          </form>
        )}
      </div>

      {/* Zusammenfassung pro Zertifikat */}
      {perCert.length > 0 && (
        <section className="card p-4 mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Häufig geprüfte Zertifikate (in der aktuellen Liste)
          </div>
          <ul className="divide-y divide-slate-100">
            {perCert.slice(0, 10).map((c) => (
              <li key={c.slug} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{c.number}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">
                    {c.count} Aufruf{c.count !== 1 ? "e" : ""}
                    {c.unseen > 0 && (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                        {c.unseen} neu
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    zuletzt {c.last.toLocaleString("de-DE")}
                  </div>
                </div>
                <Link
                  href={`/zertifikat/${c.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary text-xs shrink-0"
                >
                  Öffnen ↗
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Chronologische Liste aller Aufrufe */}
      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Chronologisch {onlyUnseen ? "(nur ungesehene)" : "(letzte 200)"}
        </div>
        {views.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">
            {onlyUnseen ? "Keine ungesehenen Aufrufe." : "Noch keine Aufrufe protokolliert."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {views.map((v) => {
              const d = parseCertificateData(v.certificate.data);
              const name =
                [d.firstName, d.lastName].filter(Boolean).join(" ") || "(ohne Name)";
              return (
                <li key={v.id} className={"px-4 py-3 flex items-start gap-3 " + (!v.seenAt ? "bg-amber-50/40" : "")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{name}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="font-mono text-xs text-slate-600">{v.certificate.number}</span>
                      {!v.seenAt && (
                        <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold align-middle">
                          neu
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {v.viewedAt.toLocaleString("de-DE")}
                      {v.referer && (
                        <>
                          {" · "}
                          <span className="truncate inline-block max-w-[240px] align-bottom" title={v.referer}>
                            von {v.referer}
                          </span>
                        </>
                      )}
                      {v.userAgent && (
                        <>
                          {" · "}
                          <span className="truncate inline-block max-w-[240px] align-bottom" title={v.userAgent}>
                            {shortUA(v.userAgent)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/zertifikat/${v.certificate.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary text-xs shrink-0"
                  >
                    Öffnen ↗
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-slate-400 mt-4">
        IP-Adressen werden nicht gespeichert (DSGVO). Aufrufe von Suchmaschinen-Bots
        können in dieser Liste erscheinen — im Zweifel am User-Agent erkennbar.
      </p>
    </Shell>
  );
}

function shortUA(ua: string): string {
  // grobe Vereinfachung, damit die Liste lesbar bleibt
  if (/bot|spider|crawler/i.test(ua)) return "Bot";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return ua.slice(0, 40);
}
