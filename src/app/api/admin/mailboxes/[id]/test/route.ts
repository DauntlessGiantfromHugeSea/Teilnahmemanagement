import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { MailboxProvider } from "@prisma/client";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { mailboxImapCredentials, mailboxTransport } from "@/lib/mailbox";
import { graphCredentials, graphTestConnection } from "@/lib/msGraphMail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Prueft den Zugang eines Postfachs: bei Microsoft 365 Token + Postfachzugriff
// ueber Graph, sonst IMAP-Login (und SMTP, falls konfiguriert).
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

  const fail = async (message: string) => {
    await prisma.mailbox.update({
      where: { id: mb.id },
      data: { lastError: message.slice(0, 500) },
    });
    return back({ error: message });
  };
  const succeed = async (message: string) => {
    await prisma.mailbox.update({ where: { id: mb.id }, data: { lastError: null } });
    return back({ ok: message });
  };

  // --- Microsoft 365 ---
  if (mb.provider === MailboxProvider.MS_GRAPH) {
    const creds = graphCredentials(mb);
    if (!creds) {
      return fail(
        "Microsoft-Zugangsdaten unvollständig. Tenant-ID, Client-ID und Secret am Postfach " +
          "eintragen oder MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET in der .env setzen " +
          '("common" ist bei App-Only nicht zulässig).'
      );
    }
    try {
      const info = await graphTestConnection(mb, creds);
      return succeed(
        `Microsoft 365 ok — Ordner „${info.displayName}" enthält ${info.total} Nachrichten. ` +
          "Versand läuft ebenfalls über Graph."
      );
    } catch (e) {
      return fail(`Graph-Zugriff fehlgeschlagen: ${(e as Error).message}`);
    }
  }

  // --- IMAP ---
  const creds = mailboxImapCredentials(mb);
  if (!creds) return fail("IMAP-Zugangsdaten unvollständig.");

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
    return fail(`IMAP fehlgeschlagen: ${(e as Error).message}`);
  } finally {
    try {
      await client.logout();
    } catch {
      /* Verbindung ist ohnehin hin */
    }
  }

  const transport = mailboxTransport(mb);
  if (transport) {
    try {
      await transport.verify();
    } catch (e) {
      return fail(`IMAP ok (${count} Mails), aber SMTP fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      transport.close();
    }
  }

  return succeed(
    `Verbindung ok — ${creds.imapFolder} enthält ${count} Nachrichten${
      transport ? ", SMTP-Login erfolgreich" : ""
    }.`
  );
}
