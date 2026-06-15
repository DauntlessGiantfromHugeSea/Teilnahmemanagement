// CSV-Export der Mitarbeiter (Name + Firma). UTF-8 mit BOM fuer Excel.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

function csvEscape(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "active";

  const staff = await prisma.staff.findMany({
    where: scope === "all" ? {} : { active: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const lines = ["Name;Firma"];
  for (const m of staff) {
    const name = `${m.firstName} ${m.lastName}`.trim();
    const firma = m.subtitle?.trim() || m.company || "";
    lines.push(`${csvEscape(name)};${csvEscape(firma)}`);
  }
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Mitarbeiter.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
