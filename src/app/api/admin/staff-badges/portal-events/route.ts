// Speichert, welche Veranstaltungen im Mitarbeiter-Portal sichtbar sind.
// Setzt das Flag global um: angeklickte Events bekommen showInStaffPortal=true,
// alle anderen (aus der gerade angezeigten Liste) =false. Vergangene und
// abgesagte Events werden nicht angefasst.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const selected = new Set(f.getAll("eventIds").map((v) => String(v)));

  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates = await prisma.event.findMany({
    where: {
      cancelled: false,
      OR: [
        { day1Date: { gte: today0 } },
        { day2Date: { gte: today0 } },
        { day1Date: null },
      ],
    },
    select: { id: true },
  });

  await Promise.all(
    candidates.map((c) =>
      prisma.event.update({
        where: { id: c.id },
        data: { showInStaffPortal: selected.has(c.id) },
      })
    )
  );

  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/staff-badges?ok=Auswahl%20gespeichert." },
  });
}
