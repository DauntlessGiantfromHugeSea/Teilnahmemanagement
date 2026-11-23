import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canSendBroadcast } from "@/lib/rbac";
import { renderBroadcast } from "@/lib/broadcast";

// Liefert die fertig gesetzte Mail als HTML zurueck, damit der Editor sie
// zeigen kann. Nichts wird verschickt und nichts gespeichert.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !canSendBroadcast(s)) return new NextResponse("Forbidden", { status: 403 });

  const data = (await req.json().catch(() => null)) as {
    subject?: unknown;
    body?: unknown;
    ctaLabel?: unknown;
    ctaUrl?: unknown;
    footerNote?: unknown;
  } | null;
  if (!data) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });

  const str = (v: unknown, max = 20_000) => (typeof v === "string" ? v.slice(0, max) : "");
  const [firstName, ...rest] = s.name.split(" ");

  const mail = await renderBroadcast(
    str(data.subject, 300) || "(ohne Betreff)",
    str(data.body),
    {
      firstName: firstName ?? s.name,
      lastName: rest.join(" "),
      company: "",
      eventTitle: "Beispiel-Veranstaltung",
      eventDate: new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    },
    {
      ctaLabel: str(data.ctaLabel, 80) || undefined,
      ctaUrl: str(data.ctaUrl, 2000) || undefined,
      footerNote: str(data.footerNote, 300) || undefined,
    }
  );

  return NextResponse.json({ html: mail.html, subject: mail.subject });
}
