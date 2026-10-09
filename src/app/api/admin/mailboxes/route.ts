import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { MailboxProvider } from "@prisma/client";
import { createMailbox, parseMailboxForm } from "@/lib/mailbox";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const input = parseMailboxForm(await req.formData());
  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/admin/postfaecher?${new URLSearchParams(q).toString()}` },
    });

  if (!input.address || !input.label) {
    return back({ error: "Adresse und Bezeichnung sind Pflicht." });
  }
  if (input.provider === MailboxProvider.IMAP && (!input.imapHost || !input.imapUser)) {
    return back({ error: "Für ein IMAP-Postfach sind Server und Benutzer Pflicht." });
  }
  if (input.provider === MailboxProvider.IMAP && !input.imapPass) {
    return back({ error: "IMAP-Passwort ist beim Anlegen Pflicht." });
  }

  try {
    await createMailbox(input);
  } catch (e) {
    return back({ error: (e as Error).message });
  }
  return back({ ok: `Postfach ${input.address} angelegt.` });
}
