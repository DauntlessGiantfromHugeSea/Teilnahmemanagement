// Cron-Endpoint: Postfaecher abholen.
//
// Wird extern alle 1-5 Minuten aufgerufen (Docker-Cron, systemd-Timer oder
// HTTP-Watchdog). Authentifizierung per Bearer-Token aus env CRON_TOKEN -
// derselbe Token wie bei /api/cron/reminders.
//
//   curl -s -H "Authorization: Bearer $CRON_TOKEN" \
//        https://teilnahme.fb-akademie.de/api/cron/mail-ingest

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ingestAllMailboxes } from "@/lib/imapIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request): Promise<NextResponse> {
  const token = process.env.CRON_TOKEN;
  if (!token) return NextResponse.json({ error: "CRON_TOKEN nicht konfiguriert" }, { status: 503 });
  // Nur der Authorization-Header. Ein Token im Query-String landet in
  // Zugriffsprotokollen, Proxy-Logs, der Browser-History und im Referer der
  // naechsten Anfrage - dort ist ein Dauergeheimnis nicht aufgehoben.
  const auth = req.headers.get("authorization") ?? "";
  if (!timingSafeStringEqual(auth, `Bearer ${token}`)) {
    return NextResponse.json(
      { error: "Forbidden", hinweis: 'Token im Header senden: Authorization: Bearer <CRON_TOKEN>' },
      { status: 403 }
    );
  }

  const results = await ingestAllMailboxes();
  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      created: acc.created + r.created,
      appended: acc.appended + r.appended,
      skipped: acc.skipped + r.skipped,
    }),
    { fetched: 0, created: 0, appended: 0, skipped: 0 }
  );

  return NextResponse.json({ ok: true, totals, mailboxes: results });
}

/** Zeichenkettenvergleich in konstanter Zeit. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
