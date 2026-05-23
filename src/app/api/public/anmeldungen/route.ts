import { NextResponse } from "next/server";
import { createAnmeldung, AnmeldungInput } from "@/lib/csvImport";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mailer";
import { confirmationMail, adminNotificationMail } from "@/lib/mailTemplates";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function authorized(req: Request): boolean {
  const expected = process.env.WEBHOOK_API_KEY;
  if (!expected || expected.length < 16) return false;
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("api-key") ??
    url.searchParams.get("api_key") ??
    "";
  if (!provided) return false;
  // Constant-time-ish compare
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalize(raw: Record<string, unknown>): AnmeldungInput {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim() !== "") return v;
    }
    return "";
  };
  const dayRaw = get("day-option", "dayOption").toUpperCase();
  const dayOption =
    dayRaw === "DAY_1" || dayRaw === "DAY_2" || dayRaw === "BOTH" ? dayRaw : undefined;
  return {
    participantName: get("participant-name", "participantName", "name", "nachname-vorname"),
    companyName: get("company-name", "companyName", "company", "firma"),
    participantEmail: get("participant-email", "participantEmail", "email"),
    phone: get("phone-number", "phoneNumber", "phone", "telefon"),
    trainingDate: get("training-date", "trainingDate"),
    billingCompany: get("billing-company-name", "billingCompanyName", "billingCompany"),
    billingName: get("billing-name", "billingName"),
    billingStreet: get("billing-street", "billingStreet"),
    billingZipCity: get("billing-zipcode-city", "billingZipcodeCity", "billingZipCity"),
    billingEmail: get("billing-email", "billingEmail", "email-rechnung"),
    remarks: get("remarks", "bemerkungen", "notes"),
    street: get("street", "strasse", "straße") || undefined,
    zip: get("zip", "plz") || undefined,
    city: get("city", "ort") || undefined,
    costCenter: get("cost-center", "costCenter", "kostenstelle") || undefined,
    eventId: get("event-id", "eventId") || undefined,
    externalId: get("external-id", "externalId") || undefined,
    dayOption: dayOption as AnmeldungInput["dayOption"],
  };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const j = await req.json();
      return typeof j === "object" && j !== null ? (j as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  // form-encoded oder multipart
  const f = await req.formData();
  const obj: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) {
    obj[k] = typeof v === "string" ? v : v.name;
  }
  return obj;
}

async function getSystemActorId(): Promise<string> {
  // Verwende den aeltesten Admin-Account als actor für Audit
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? "system";
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return jsonError(401, "API key fehlt oder ungültig");
  }
  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return jsonError(400, "Body konnte nicht gelesen werden");
  }
  const input = normalize(body);
  if (!input.participantEmail || !input.participantName) {
    return jsonError(400, "participant-name oder participant-email fehlt");
  }
  if (!input.eventId && !input.externalId && !input.trainingDate) {
    return jsonError(400, "event-id, external-id oder training-date erforderlich");
  }
  const actorId = await getSystemActorId();
  try {
    const res = await createAnmeldung(input, { actorId });
    await audit({
      actorId,
      action: "WEBHOOK_ANMELDUNG",
      entityType: "Participant",
      entityId: res.participantId,
      participantId: res.participantId,
      diff: { source: "webhook", status: res.status, eventId: res.eventId },
    });

    // Mailing nur bei NEU angelegtem Teilnehmer, nicht bei Duplikaten.
    if (res.status === "created") {
      const [ev, part] = await Promise.all([
        prisma.event.findUnique({ where: { id: res.eventId } }),
        prisma.participant.findUnique({ where: { id: res.participantId } }),
      ]);
      if (ev && part) {
        const appName = process.env.APP_NAME ?? "FB-Akademie Teilnahmemanagement";
        const appUrl = process.env.APP_URL ?? "";
        const email = input.participantEmail.trim().toLowerCase();
        const conf = confirmationMail({
          event: ev,
          participantName: input.participantName,
          participantEmail: email,
          dayOption: part.dayOption,
          appName,
          appUrl,
        });
        void sendMail({
          to: email,
          subject: conf.subject,
          text: conf.text,
          html: conf.html,
        }).catch((e) => console.error("[webhook] Bestätigungsmail fehlgeschlagen:", e));

        const adminTo = process.env.MAIL_ADMIN?.trim();
        if (adminTo) {
          const note = adminNotificationMail({
            event: ev,
            participantName: input.participantName,
            participantEmail: email,
            company: input.companyName ?? "",
            dayOption: part.dayOption,
            appUrl,
            participantId: res.participantId,
            eventId: res.eventId,
          });
          void sendMail({
            to: adminTo.split(",").map((s) => s.trim()).filter(Boolean),
            subject: note.subject,
            text: note.text,
            html: note.html,
            replyTo: email,
          }).catch((e) => console.error("[webhook] Admin-Mail fehlgeschlagen:", e));
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        status: res.status,
        participantId: res.participantId,
        eventId: res.eventId,
        message: res.message,
      },
      { status: res.status === "duplicate" ? 200 : 201 }
    );
  } catch (e: any) {
    return jsonError(422, `Konnte Anmeldung nicht anlegen: ${e?.message ?? e}`);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST mit X-Api-Key Header." });
}
