import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !canWriteGlobal(s)) return new NextResponse("Forbidden", { status: 403 });
  await prisma.wissenstestQuestion.delete({ where: { id: params.id } });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/wissenstest?ok=${encodeURIComponent("Frage gelöscht.")}` },
  });
}
