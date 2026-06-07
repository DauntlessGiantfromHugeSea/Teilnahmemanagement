import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getStaffPortalToken } from "@/lib/staffPortalToken";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
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
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Event, das heute laeuft -> direkt rein
  const todayEvent = await prisma.event.findFirst({
    where: {
      cancelled: false,
      OR: [
        { day1Date: { gte: today0, lt: new Date(today0.getTime() + 86400_000) } },
        { day2Date: { gte: today0, lt: new Date(today0.getTime() + 86400_000) } },
      ],
    },
    orderBy: { day1Date: "asc" },
  });
  if (todayEvent && !searchParams.all) {
    redirect(`/portal/${todayEvent.id}`);
  }

  const showAll = searchParams.all === "1";
  const events = await prisma.event.findMany({
    where: showAll ? { cancelled: false } : { cancelled: false, day1Date: { gte: today0 } },
    orderBy: { day1Date: "asc" },
    take: 50,
  });

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
            Wähle die Schulung aus, deren Portal du sehen möchtest.
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 space-y-3">
        {events.length === 0 ? (
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
          events.map((ev) => (
            <Link
              key={ev.id}
              href={`/portal/${ev.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition hover:border-brand-300"
            >
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
          ))
        )}
        {!showAll && events.length > 0 && (
          <div className="text-center pt-2">
            <Link href={`/portal/staff/${params.token}?all=1`} className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
              auch vergangene Veranstaltungen anzeigen
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
