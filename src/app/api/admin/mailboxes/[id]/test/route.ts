import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { mailboxImapCredentials, mailboxTransport } from "@/lib/mailbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Prueft IMAP-Login (und, falls konfiguriert, SMTP) eines Postfachs.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/admin/postfaecher?${new URLSearchParams(q).toString()}` },
    });

  const mb = await prisma.mailbox.findUnique({ where: { id: params.id } });
  if (!mb) return back({ error: "Postfach nicht gefunden." });

  const creds = mailboxImapCredentials(mb);
  if (!creds) return back({ error: "IMAP-Zugangsdaten unvollständig." });

  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapSecure,
    auth: { user: creds.imapUser, pass: creds.imapPass },
    logger: false,
  });

  let count = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(creds.imapFolder);
    try {
      const box = client.mailbox;
      count = box && typeof box !== "boolean" ? Number(box.exists ?? 0) : 0;
    } finally {
      lock.release();
    }
  } catch (e) {
    await prisma.mailbox.update({
      where: { id: mb.id },
      data: { lastError: (e as Error).message.slice(0, 500) },
    });
    return back({ error: `IMAP fehlgeschlagen: ${(e as Error).message}` });
  } finally {
    try {
      await client.logout();
    } catch {
      /* egal */
    }
  }

  const transport = mailboxTransport(mb);
  if (transport) {
    try {
      await transport.verify();
    } catch (e) {
      return back({ error: `IMAP ok (${count} Mails), aber SMTP fehlgeschlagen: ${(e as Error).message}` });
    } finally {
      transport.close();
    }
  }

  await prisma.mailbox.update({ where: { id: mb.id }, data: { lastError: null } });
  return back({
    ok: `Verbindung ok — ${creds.imapFolder} enthält ${count} Nachrichten${transport ? ", SMTP-Login erfolgreich" : ""}.`,
  });
}
