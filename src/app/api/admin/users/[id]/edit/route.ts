import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { Role } from "@prisma/client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const name = String(f.get("name") ?? "").trim();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const role = String(f.get("role") ?? "VIEWER") as Role;
  const active = f.get("active") === "on";
  const totpRequired = f.get("totpRequired") === "on";

  const before = await prisma.user.findUnique({ where: { id: params.id } });
  if (!before) return new NextResponse("Not found", { status: 404 });

  if (!name) {
    return NextResponse.redirect(
      new URL(`/admin/users/${params.id}/edit?error=${encodeURIComponent("Name darf nicht leer sein.")}`, req.url),
      303
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.redirect(
      new URL(`/admin/users/${params.id}/edit?error=${encodeURIComponent("Ungültige E-Mail-Adresse.")}`, req.url),
      303
    );
  }
  if (!Object.values(Role).includes(role)) {
    return NextResponse.redirect(
      new URL(`/admin/users/${params.id}/edit?error=${encodeURIComponent("Ungültige Rolle.")}`, req.url),
      303
    );
  }

  if (email !== before.email) {
    const dupe = await prisma.user.findUnique({ where: { email } });
    if (dupe && dupe.id !== before.id) {
      return NextResponse.redirect(
        new URL(`/admin/users/${params.id}/edit?error=${encodeURIComponent("E-Mail bereits vergeben.")}`, req.url),
        303
      );
    }
  }

  // Eigenes Konto: weder Rolle herabstufen noch deaktivieren
  let finalRole = role;
  let finalActive = active;
  if (params.id === s.uid) {
    finalRole = before.role;
    finalActive = true;
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { name, email, role: finalRole, active: finalActive, totpRequired },
  });

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (before.name !== name) diff.name = { from: before.name, to: name };
  if (before.email !== email) diff.email = { from: before.email, to: email };
  if (before.role !== finalRole) diff.role = { from: before.role, to: finalRole };
  if (before.active !== finalActive) diff.active = { from: before.active, to: finalActive };
  if (before.totpRequired !== totpRequired)
    diff.totpRequired = { from: before.totpRequired, to: totpRequired };

  if (Object.keys(diff).length > 0) {
    await audit({
      actorId: s.uid,
      action: "UPDATE",
      entityType: "User",
      entityId: params.id,
      diff,
    });
  }

  return NextResponse.redirect(
    new URL(`/admin/users/${params.id}/edit?ok=${encodeURIComponent("Gespeichert.")}`, req.url),
    303
  );
}
