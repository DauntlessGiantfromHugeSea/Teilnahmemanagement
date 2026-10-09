import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Loescht ein Postfach. Bereits importierte Tickets bleiben erhalten
// (mailboxId wird auf null gesetzt), damit keine Historie verloren geht.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/admin/postfaecher?${new URLSearchParams(q).toString()}` },
    });

  try {
    await prisma.mailbox.delete({ where: { id: params.id } });
  } catch (e) {
    return back({ error: (e as Error).message });
  }
  return back({ ok: "Postfach gelöscht. Vorhandene Tickets bleiben erhalten." });
}
