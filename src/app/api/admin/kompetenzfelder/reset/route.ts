import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await prisma.appSetting.delete({ where: { key: "certKompetenzfelder" } }).catch(() => null);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/kompetenzfelder?ok=Standard%20wiederhergestellt." },
  });
}
