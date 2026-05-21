import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { audit } from "@/lib/audit";

function toCents(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Math.round((isFinite(n) ? n : 0) * 100);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !canWriteGlobal(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  await prisma.training.update({
    where: { id: params.id },
    data: {
      title: String(f.get("title") ?? "").trim(),
      description: String(f.get("description") ?? "") || null,
      priceDay1: toCents(f.get("priceDay1")),
      priceDay2: toCents(f.get("priceDay2")),
      priceBoth: toCents(f.get("priceBoth")),
      active: f.get("active") === "on",
    },
  });
  await audit({ actorId: s.uid, action: "UPDATE", entityType: "Training", entityId: params.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/trainings` } });
}
