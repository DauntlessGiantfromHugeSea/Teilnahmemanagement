// Cron-Endpoint: Postfaecher abholen.
//
// Wird extern alle 1-5 Minuten aufgerufen (Docker-Cron, systemd-Timer oder
// HTTP-Watchdog). Authentifizierung per Bearer-Token aus env CRON_TOKEN -
// derselbe Token wie bei /api/cron/reminders.
//
//   curl -s -H "Authorization: Bearer $CRON_TOKEN" \
//        https://teilnahme.fb-akademie.de/api/cron/mail-ingest

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
  const auth = req.headers.get("authorization") ?? "";
  const qToken = new URL(req.url).searchParams.get("token") ?? "";
  if (auth !== `Bearer ${token}` && qToken !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
