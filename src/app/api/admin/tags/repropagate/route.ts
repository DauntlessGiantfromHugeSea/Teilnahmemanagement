// Geht alle Teilnehmer durch und uebernimmt Tags von anderen Teilnehmern der
// gleichen Firma. Useful nach manuellem Hinzufuegen neuer Tags zur Firma.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { propagateTagsByCompany, companyHashOf } from "@/lib/tags";
import { safeDecrypt } from "@/lib/crypto";

export const maxDuration = 300;

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  // 1) Backfill: companyHash fuer Teilnehmer, bei denen noch keiner gesetzt ist.
  const missing = await prisma.participant.findMany({
    where: { companyHash: null },
    select: { id: true, company: true },
  });
  let backfilled = 0;
  for (const p of missing) {
    const plain = safeDecrypt(p.company);
    const h = companyHashOf(plain);
    if (h) {
      await prisma.participant.update({ where: { id: p.id }, data: { companyHash: h } });
      backfilled++;
    }
  }

  // 2) Auto-Tag-Zuordnung anwenden
  const participants = await prisma.participant.findMany({
    where: { companyHash: { not: null } },
    select: { id: true },
  });
  let added = 0;
  for (const p of participants) {
    added += await propagateTagsByCompany(p.id).catch(() => 0);
  }
  void backfilled;
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/admin/tags?ok=${encodeURIComponent(`${added} Auto-Tag-Zuordnung${added === 1 ? "" : "en"} ergänzt.`)}`,
    },
  });
}
