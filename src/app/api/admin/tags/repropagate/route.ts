// Geht alle Teilnehmer durch und uebernimmt Tags von anderen Teilnehmern der
// gleichen Firma. Useful nach manuellem Hinzufuegen neuer Tags zur Firma.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { propagateTagsByCompany, companyHashOf, emailDomainHashOf } from "@/lib/tags";
import { safeDecrypt } from "@/lib/crypto";

export const maxDuration = 300;

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  // 1) Backfill: companyHash UND emailDomainHash fuer alle Teilnehmer setzen,
  //    bei denen einer der beiden Werte noch fehlt.
  const missing = await prisma.participant.findMany({
    where: { OR: [{ companyHash: null }, { emailDomainHash: null }] },
    select: { id: true, company: true, email: true, companyHash: true, emailDomainHash: true },
  });
  let backfilled = 0;
  for (const p of missing) {
    const data: { companyHash?: string | null; emailDomainHash?: string | null } = {};
    if (p.companyHash === null) {
      const h = companyHashOf(safeDecrypt(p.company));
      if (h) data.companyHash = h;
    }
    if (p.emailDomainHash === null) {
      const h = emailDomainHashOf(safeDecrypt(p.email));
      if (h) data.emailDomainHash = h;
    }
    if (Object.keys(data).length > 0) {
      await prisma.participant.update({ where: { id: p.id }, data });
      backfilled++;
    }
  }

  // 2) Auto-Tag-Zuordnung anwenden (Match ueber Firma ODER Mail-Domain)
  const participants = await prisma.participant.findMany({
    where: {
      OR: [
        { companyHash: { not: null } },
        { emailDomainHash: { not: null } },
      ],
    },
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
