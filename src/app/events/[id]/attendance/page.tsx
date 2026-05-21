import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canViewEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { Logo } from "@/components/Logo";
import { DayOption } from "@prisma/client";

function dayLabel(d: DayOption) {
  return d === "DAY_1" ? "Tag 1" : d === "DAY_2" ? "Tag 2" : "Beide Tage";
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { day?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect(`/events/${params.id}`);

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      training: true,
      participants: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
  });
  if (!ev) notFound();

  const day = searchParams.day === "1" ? 1 : searchParams.day === "2" ? 2 : null;
  const all = ev.participants.map(decryptParticipant);
  const participants = all.filter((p) => {
    if (day === 1) return p.dayOption === "DAY_1" || p.dayOption === "BOTH";
    if (day === 2) return p.dayOption === "DAY_2" || p.dayOption === "BOTH";
    return true;
  });
  // Nach Nachname sortieren (entschluesselt)
  participants.sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? "", "de"));

  const dateLabel =
    day === 1 && ev.day1Date
      ? ev.day1Date.toLocaleDateString("de-DE")
      : day === 2 && ev.day2Date
      ? ev.day2Date.toLocaleDateString("de-DE")
      : [
          ev.day1Date?.toLocaleDateString("de-DE"),
          ev.day2Date?.toLocaleDateString("de-DE"),
        ]
          .filter(Boolean)
          .join(" - ") || "-";

  return (
    <div className="attendance min-h-screen bg-white">
      <div className="no-print bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-slate-700">
          Anwesenheitsliste &mdash; Druck als PDF: <kbd>Cmd</kbd>/<kbd>Strg</kbd>+<kbd>P</kbd>
        </div>
        <div className="flex gap-2">
          <a
            href={`/events/${ev.id}/attendance`}
            className={"btn-secondary text-xs " + (day === null ? "ring-2 ring-brand-500" : "")}
          >
            Alle Teilnehmer
          </a>
          {ev.day1Date && (
            <a
              href={`/events/${ev.id}/attendance?day=1`}
              className={"btn-secondary text-xs " + (day === 1 ? "ring-2 ring-brand-500" : "")}
            >
              Nur Tag 1
            </a>
          )}
          {ev.day2Date && (
            <a
              href={`/events/${ev.id}/attendance?day=2`}
              className={"btn-secondary text-xs " + (day === 2 ? "ring-2 ring-brand-500" : "")}
            >
              Nur Tag 2
            </a>
          )}
          <a href={`/events/${ev.id}`} className="btn-secondary text-xs">
            Zurueck
          </a>
        </div>
      </div>

      <div className="sheet px-8 py-8">
        <header className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Anwesenheitsliste{day ? ` - Tag ${day}` : ""}
            </div>
            <h1 className="text-2xl font-semibold mt-1">{ev.title}</h1>
            <div className="text-sm text-slate-700 mt-1">
              {ev.training.title}
            </div>
            <div className="text-sm text-slate-700 mt-2 grid grid-cols-2 gap-x-6 gap-y-1 max-w-xl">
              <div>
                <span className="text-slate-500">Datum: </span>
                {dateLabel}
              </div>
              {(ev.startTime || ev.endTime) && (
                <div>
                  <span className="text-slate-500">Zeit: </span>
                  {ev.startTime ?? "?"}
                  {ev.endTime ? ` - ${ev.endTime}` : ""}
                  {" Uhr"}
                </div>
              )}
              {ev.location && (
                <div className="col-span-2">
                  <span className="text-slate-500">Ort: </span>
                  {ev.location}
                </div>
              )}
              {ev.format === "WEBINAR" && (
                <div className="col-span-2">
                  <span className="text-slate-500">Format: </span>
                  Webinar (online)
                </div>
              )}
            </div>
          </div>
          <Logo className="h-12 w-auto shrink-0" />
        </header>

        <table className="attendance-table w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="th-num">Nr.</th>
              <th className="th-name">Name</th>
              <th className="th-company">Firma</th>
              <th className="th-zip">PLZ</th>
              <th className="th-city">Ort</th>
              <th className="th-remarks">Bemerkungen</th>
              <th className="th-sig">Unterschrift</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, idx) => (
              <tr key={p.id}>
                <td className="td-num">{idx + 1}</td>
                <td className="td-name">
                  <div className="font-medium">
                    {p.lastName}
                    {p.firstName ? `, ${p.firstName}` : ""}
                  </div>
                  {day === null && (
                    <div className="text-xs text-slate-500">{dayLabel(p.dayOption)}</div>
                  )}
                </td>
                <td>{p.company ?? ""}</td>
                <td>{p.zip ?? ""}</td>
                <td>{p.city ?? ""}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
            {/* Leerzeilen fuer handschriftliche Nachtraege */}
            {Array.from({ length: Math.max(0, 4) }).map((_, i) => (
              <tr key={`blank-${i}`} className="blank">
                <td className="td-num text-slate-300">{participants.length + i + 1}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-10 grid grid-cols-2 gap-12">
          <div>
            <div className="border-t border-slate-400 pt-1 text-xs text-slate-600">
              Ort, Datum
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1 text-xs text-slate-600">
              Unterschrift Veranstaltungsleitung
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
