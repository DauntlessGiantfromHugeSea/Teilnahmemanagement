import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { parseMailboxForm, updateMailbox } from "@/lib/mailbox";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const input = parseMailboxForm(await req.formData());
  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/admin/postfaecher?${new URLSearchParams(q).toString()}` },
    });

  if (!input.address || !input.label || !input.imapHost || !input.imapUser) {
    return back({ error: "Adresse, Bezeichnung, IMAP-Server und IMAP-Benutzer sind Pflicht." });
  }

  try {
    await updateMailbox(params.id, input);
  } catch (e) {
    return back({ error: (e as Error).message });
  }
  return back({ ok: `Postfach ${input.address} gespeichert.` });
}
