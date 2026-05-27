import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { seeOther } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await prisma.newsletterSubscriber.delete({ where: { id: params.id } });
  await audit({ actorId: s.uid, action: "NEWSLETTER_DELETE", entityType: "NewsletterSubscriber", entityId: params.id });
  return seeOther("/admin/newsletter?ok=1");
}
