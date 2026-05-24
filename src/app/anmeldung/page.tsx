import Link from "next/link";
import { prisma } from "@/lib/db";
import { basePriceCents, formatEUR } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anmeldung - FB-Akademie",
};

export default async function AnmeldungUebersicht() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const events = await prisma.event.findMany({
    where: {
      cancelled: false,
      OR: [{ day1Date: { gte: todayStart } }, { day1Date: null }],
    },
    include: {
      training: true,
      _count: { select: { participants: true } },
    },
    orderBy: [{ day1Date: "asc" }, { createdAt: "desc" }],
  });

  // Optional bereits ausgebuchte am Ende
  const offen = events.filter((e) => e.capacity == null || e._count.participants < e.capacity);
  const voll = events.filter((e) => e.capacity != null && e._count.participants >= e.capacity);

  const fmt = (d?: Date | null) =>
    d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : null;

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-8 bg-transparent">
      <div className="w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Anmeldung zu Veranstaltungen</h1>
          <p className="text-sm text-slate-500 mt-2">
            Wählen Sie die gewünschte Veranstaltung aus.
          </p>
        </div>

        {offen.length === 0 && voll.length === 0 ? (
          <div className="card p-8 text-center text-slate-500 text-sm">
            Aktuell sind keine Veranstaltungen für eine Anmeldung verfügbar.
          </div>
        ) : (
          <div className="space-y-3">
            {offen.map((e) => {
              const day1 = fmt(e.day1Date);
              const day2 = fmt(e.day2Date);
              const dateLine = day1 && day2 ? `${day1} - ${day2}` : day1 ?? "Termin folgt";
              const price = basePriceCents(e.training, e.day2Date ? "BOTH" : "DAY_1");
              const free = e.capacity ? Math.max(0, e.capacity - e._count.participants) : null;
              return (
                <Link
                  key={e.id}
                  href={`/anmeldung/${e.id}`}
                  className="block card overflow-hidden hover:border-brand-300 transition group"
                >
                  {e.heroImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={e.heroImageUrl}
                      alt=""
                      className="w-full h-32 sm:h-40 object-cover"
                    />
                  )}
                  <div className="p-5 flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={
                            "badge " +
                            (e.format === "WEBINAR"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-brand-100 text-brand-700")
                          }
                        >
                          {e.format === "WEBINAR" ? "Webinar" : "Vor Ort"}
                        </span>
                        {e.day2Date && (
                          <span className="badge bg-slate-100 text-slate-600">2 Tage</span>
                        )}
                        {free != null && free <= 5 && free > 0 && (
                          <span className="badge bg-amber-100 text-amber-800">
                            nur noch {free} Plätze
                          </span>
                        )}
                      </div>
                      <h2 className="font-semibold text-slate-800 group-hover:text-brand-700">
                        {e.title}
                      </h2>
                      <div className="text-sm text-slate-500 mt-1">
                        {dateLine}
                        {e.format === "PRESENCE" && e.location ? ` · ${e.location}` : ""}
                        {e.format === "WEBINAR" ? " · online" : ""}
                      </div>
                      {e.description && (
                        <p className="text-sm text-slate-600 mt-2 line-clamp-2">{e.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {price > 0 && (
                        <div className="mb-2">
                          <div className="text-lg font-semibold text-slate-800">
                            {formatEUR(price)}
                          </div>
                          <div className="text-[10px] text-slate-500">zzgl. 19 % MwSt.</div>
                        </div>
                      )}
                      <span className="btn-primary text-sm">Anmelden →</span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {voll.length > 0 && (
              <div className="pt-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Ausgebucht
                </div>
                <div className="space-y-2">
                  {voll.map((e) => {
                    const day1 = fmt(e.day1Date);
                    const day2 = fmt(e.day2Date);
                    const dateLine = day1 && day2 ? `${day1} - ${day2}` : day1 ?? "";
                    return (
                      <div key={e.id} className="card p-4 opacity-60">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-700">{e.title}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{dateLine}</div>
                          </div>
                          <span className="badge bg-slate-200 text-slate-600">ausgebucht</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          Alle Preise zzgl. 19 % MwSt. Die Rechnung wird Ihnen nach der Anmeldung zugesandt.
        </p>
      </div>
    </div>
  );
}
