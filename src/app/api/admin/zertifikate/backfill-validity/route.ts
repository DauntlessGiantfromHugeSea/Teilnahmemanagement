// Traegt fuer alle ZERTIFIKAT-Eintraege ohne 'validUntilShort' im Snapshot ein
// Gueltigkeitsdatum (Ausstellung + 24 Monate) nach. Idempotent: beruehrt nur
// Datensaetze ohne bisheriges Gueltig-bis.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getCertTexts } from "@/lib/kompetenzfelder";

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseDeDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const texts = await getCertTexts();
  const months = texts.validityMonths ?? 24;

  const certs = await prisma.certificate.findMany({
    where: { type: "ZERTIFIKAT" },
    select: { id: true, data: true, issuedAt: true },
  });
  let updated = 0;
  let skipped = 0;
  for (const c of certs) {
    try {
      const snap = JSON.parse(c.data) as any;
      if (snap.validUntilShort) { skipped++; continue; }
      const issued = parseDeDate(snap.issuedDateShort) ?? c.issuedAt ?? null;
      if (!issued) { skipped++; continue; }
      const until = new Date(issued);
      until.setMonth(until.getMonth() + months);
      snap.validUntilShort = fmtDateShort(until);
      await prisma.certificate.update({
        where: { id: c.id },
        data: { data: JSON.stringify(snap) },
      });
      updated++;
    } catch {
      skipped++;
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/admin/zertifikate/import?ok=${encodeURIComponent(
        `Gültigkeit nachgetragen: ${updated} aktualisiert, ${skipped} übersprungen (bereits gesetzt oder kein Datum).`
      )}`,
    },
  });
}
