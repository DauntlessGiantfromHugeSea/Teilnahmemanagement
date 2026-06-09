import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST() {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  await prisma.user.update({ where: { id: s.uid }, data: { signatureUrl: null } });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/account?ok=Unterschrift+gel%C3%B6scht." },
  });
}
