import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await prisma.appSetting.delete({ where: { key: "feedbackQuestions" } }).catch(() => null);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/feedback-fragen?ok=Standard%20wiederhergestellt." },
  });
}
