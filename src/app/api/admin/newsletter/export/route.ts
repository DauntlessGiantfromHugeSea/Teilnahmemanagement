import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { decryptSubscriber } from "@/lib/newsletter";

function csvCell(v: string): string {
  if (/[",;\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const subs = await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" } });
  const rows = [["email", "firstName", "lastName", "company", "status", "source", "tags", "createdAt"]];
  for (const raw of subs) {
    const d = decryptSubscriber(raw);
    rows.push([
      d.email ?? "",
      d.firstName ?? "",
      d.lastName ?? "",
      d.company ?? "",
      d.status,
      d.source,
      d.tagList.join("|"),
      d.createdAt.toISOString(),
    ]);
  }
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
