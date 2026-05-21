import { NextResponse } from "next/server";
import { createAnmeldung, AnmeldungInput } from "@/lib/csvImport";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function authorized(req: Request): boolean {
  const expected = process.env.WEBHOOK_API_KEY;
  if (!expected || expected.length < 16) return false;
  const provided =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
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
  return {
    participantName: get("participant-name", "participantName", "name"),
    companyName: get("company-name", "companyName", "company", "firma"),
    participantEmail: get("participant-email", "participantEmail", "email"),
    phone: get("phone-number", "phoneNumber", "phone", "telefon"),
    trainingDate: get("training-date", "trainingDate"),
    billingCompany: get("billing-company-name", "billingCompanyName", "billingCompany"),
    billingName: get("billing-name", "billingName"),
    billingStreet: get("billing-street", "billingStreet"),
    billingZipCity: get("billing-zipcode-city", "billingZipcodeCity", "billingZipCity"),
    billingEmail: get("billing-email", "billingEmail"),
    remarks: get("remarks", "bemerkungen", "notes"),
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
  if (!input.participantEmail || !input.participantName || !input.trainingDate) {
    return jsonError(400, "participant-name, participant-email oder training-date fehlt");
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
