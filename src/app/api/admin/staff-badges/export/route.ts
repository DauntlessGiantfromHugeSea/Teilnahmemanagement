// CSV-Export der Mitarbeiter (Name + Firma). UTF-8 mit BOM fuer Excel.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "active";

  const staff = await prisma.staff.findMany({
    where: scope === "all" ? {} : { active: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows: string[][] = [["Name", "Firma"]];
  for (const m of staff) {
    rows.push([
      `${m.firstName} ${m.lastName}`.trim(),
      m.subtitle?.trim() || m.company || "",
    ]);
  }
  const csv = toCsv(rows) + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Mitarbeiter.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
