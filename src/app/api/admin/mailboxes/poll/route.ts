import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { ingestAllMailboxes } from "@/lib/imapIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// "Jetzt abholen" aus der Admin-Oberflaeche - dieselbe Logik wie der Cron.
export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const results = await ingestAllMailboxes();
  const created = results.reduce((n, r) => n + r.created, 0);
  const appended = results.reduce((n, r) => n + r.appended, 0);
  const errors = results.filter((r) => r.error).map((r) => `${r.mailbox}: ${r.error}`);

  const q: Record<string, string> = errors.length
    ? { error: errors.join(" | ") }
    : { ok: `Abgeholt — ${created} neue Tickets, ${appended} Antworten zugeordnet.` };

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/postfaecher?${new URLSearchParams(q).toString()}` },
  });
}
