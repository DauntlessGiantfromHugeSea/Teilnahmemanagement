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

  // Anker fuer Item[0] ist seine eigene startTime; ab dann cascade. Wird auf
  // einem spaeteren Item startTimeManual=true gesetzt, beginnt die Cascade
  // von diesem Punkt neu (z.B. nach Verzoegerung).
  let cursor: number | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const dur = Number.isFinite(it.durationMin) && it.durationMin >= 0 ? it.durationMin : 0;
    let start: number;
    if (i === 0 || it.startTimeManual) {
      const own = toMin(it.startTime);
      if (own === null) {
        // Wenn manuell markiert aber kein gueltiger Wert: weiter cascade.
        if (cursor === null) return;
        start = cursor;
      } else {
        start = own;
      }
    } else {
      if (cursor === null) {
        // Cascade ohne Anker - sollte nicht passieren, aber sicherheitshalber:
        const own = toMin(it.startTime);
        if (own === null) return;
        start = own;
      } else {
        start = cursor;
      }
    }
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
