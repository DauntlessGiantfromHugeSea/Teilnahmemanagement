// Berechnet startTime/endTime aller Agenda-Eintraege eines Tages neu,
// basierend auf dem Anker (= startTime des ersten Eintrags nach Position)
// + kumulierten Dauern. Wird nach jeder Aenderung (create/update/delete/move)
// aufgerufen.

import { prisma } from "./db";

function toMin(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function toHHMM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function recomputeDay(eventId: string, day: number): Promise<void> {
  const items = await prisma.eventAgendaItem.findMany({
    where: { eventId, day },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (items.length === 0) return;

  const anchor = toMin(items[0].startTime);
  if (anchor === null) return; // erster Eintrag hat keine valide Startzeit -> nichts tun
  let cursor = anchor;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const dur = Number.isFinite(it.durationMin) && it.durationMin >= 0 ? it.durationMin : 0;
    const start = i === 0 ? anchor : cursor;
    const end = start + dur;
    const startStr = toHHMM(start);
    const endStr = toHHMM(end);
    if (it.startTime !== startStr || it.endTime !== endStr) {
      await prisma.eventAgendaItem.update({
        where: { id: it.id },
        data: { startTime: startStr, endTime: endStr },
      });
    }
    cursor = end;
  }
}
