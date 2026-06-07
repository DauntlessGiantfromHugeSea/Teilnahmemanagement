import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getStaffPortalToken } from "@/lib/staffPortalToken";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function isToday(d: Date | null, today0: number): boolean {
  if (!d) return false;
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() === today0;
}

export default async function StaffPortalLanding({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { all?: string };
}) {
  const expected = await getStaffPortalToken();
  if (!expected || params.token !== expected) notFound();

  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const showAll = searchParams.all === "1";

  const events = await prisma.event.findMany({
    where: showAll
      ? { cancelled: false, showInStaffPortal: true }
      : { cancelled: false, showInStaffPortal: true, day1Date: { gte: new Date(today0) } },
    orderBy: { day1Date: "asc" },
    take: 50,
  });

  // Heute laufende Events nach vorn stellen
  const sorted = [
    ...events.filter((e) => isToday(e.day1Date, today0) || isToday(e.day2Date, today0)),
    ...events.filter((e) => !(isToday(e.day1Date, today0) || isToday(e.day2Date, today0))),
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/30">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-2xl mx-auto px-4 pt-8 pb-8 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://fluessigbodenakademie.de/wp-content/uploads/2024/12/fba.png"
            alt="Flüssigboden Akademie"
            className="h-10 w-auto mb-5"
          />
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider mb-3">
            Schulungs-Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">Schulung auswählen</h1>
          <p className="mt-2 text-sm text-white/85">
            Wähle aus, welches Schulungs-Portal du sehen möchtest.
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 space-y-3">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Aktuell keine {showAll ? "" : "anstehenden "}Veranstaltungen gefunden.
            {!showAll && (
              <div className="mt-3">
                <Link href={`/portal/staff/${params.token}?all=1`} className="text-brand-700 hover:underline text-sm">
                  Alle Veranstaltungen anzeigen
                </Link>
              </div>
            )}
          </div>
        ) : (
          sorted.map((ev) => {
            const live = isToday(ev.day1Date, today0) || isToday(ev.day2Date, today0);
            return (
              <Link
                key={ev.id}
                href={`/portal/${ev.id}`}
                className={
                  "block rounded-2xl border p-4 shadow-sm transition " +
                  (live
                    ? "border-brand-400 bg-brand-50 hover:shadow-md hover:border-brand-500"
                    : "border-slate-200 bg-white hover:shadow-md hover:border-brand-300")
                }
              >
                {live && (
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-brand-700 mb-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-600" />
                    </span>
                    läuft heute
                  </div>
                )}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-xs text-brand-700 shrink-0">
                    {fmt(ev.day1Date)}{ev.day2Date ? ` – ${fmt(ev.day2Date)}` : ""}
                  </span>
                  <span className="font-semibold text-slate-900 flex-1">{ev.title}</span>
                </div>
                {ev.location && (
                  <div className="text-xs text-slate-500 mt-1">{ev.location}</div>
                )}
              </Link>
            );
          })
        )}
        {!showAll && sorted.length > 0 && (
          <div className="text-center pt-2">
            <Link href={`/portal/staff/${params.token}?all=1`} className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
              auch vergangene Veranstaltungen anzeigen
            </Link>
          </div>
        )}
        {showAll && (
          <div className="text-center pt-2">
            <Link href={`/portal/staff/${params.token}`} className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
              nur anstehende anzeigen
            </Link>
          </div>
        )}

        <p className="pt-6 text-center text-[11px] uppercase tracking-wider text-slate-400">
          Flüssigboden Akademie
        </p>
      </div>
    </main>
  );
}
