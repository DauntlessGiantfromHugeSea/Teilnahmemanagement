// Generiert eine Veranstaltungs-ID im Format YYMMNN (z.B. 260301 = 2026, März, lfd. Nr. 01).
// Basis ist day1Date des Events, sonst der Tag der Anlage. Pro YYMM wird die naechste
// freie Sequenznummer 01..99 vergeben.

import { prisma } from "./db";

export async function generateEventExternalId(day1Date: Date | null): Promise<string | null> {
  const base = day1Date ?? new Date();
  const yy = String(base.getFullYear() % 100).padStart(2, "0");
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}${mm}`;

  // Alle vorhandenen externalIds dieses Monats holen
  const existing = await prisma.event.findMany({
    where: { externalId: { startsWith: prefix } },
    select: { externalId: true },
  });
  const taken = new Set(existing.map((e) => e.externalId).filter(Boolean) as string[]);

  for (let n = 1; n < 100; n++) {
    const candidate = `${prefix}${String(n).padStart(2, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Fallback fuer den unwahrscheinlichen Fall > 99 Events / Monat
  return `${prefix}${Date.now().toString().slice(-3)}`;
}
