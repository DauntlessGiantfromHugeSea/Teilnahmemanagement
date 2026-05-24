import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashToken } from "@/lib/pwToken";
import { audit } from "@/lib/audit";

function back(token: string, err: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/set-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(err)}`,
    },
  });
}

export async function POST(req: Request) {
  const f = await req.formData();
  const token = String(f.get("token") ?? "").trim();
  const p1 = String(f.get("password") ?? "");
  const p2 = String(f.get("password2") ?? "");

  if (!token) return new NextResponse("Token fehlt", { status: 400 });
  if (p1.length < 10) return back(token, "Passwort muss mindestens 10 Zeichen lang sein");
  if (p1 !== p2) return back(token, "Passwoerter stimmen nicht ueberein");

  const hash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { pwTokenHash: hash },
  });
  if (!user) return back(token, "Link ungueltig oder bereits eingeloest");
  if (!user.active) return back(token, "Account deaktiviert");
  if (!user.pwTokenExpiresAt || user.pwTokenExpiresAt < new Date()) {
    return back(token, "Link abgelaufen - bitte neuen Link anfordern");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(p1),
      pwTokenHash: null,
      pwTokenExpiresAt: null,
    },
  });

  await audit({
    actorId: user.id,
    action: "PASSWORD_SET",
    entityType: "User",
    entityId: user.id,
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/login?ok=password-set` },
  });
}
