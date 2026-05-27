import { NextResponse } from "next/server";
import { subscribe } from "@/lib/newsletter";

// Generischer Newsletter-Webhook. Funktioniert mit Contact Form 7 (CFDB7/
// Webhook-Plugin), aber auch mit jedem anderen System, das ein POST sendet
// (JSON oder form-encoded). Schutz via X-Api-Key (WEBHOOK_API_KEY).
// Double-Opt-In wird immer ausgeloest (DSGVO).

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
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
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
  const f = await req.formData();
  const obj: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) obj[k] = typeof v === "string" ? v : v.name;
  return obj;
}

function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

function parseTags(raw: Record<string, unknown>): string[] {
  const v = raw["tags"] ?? raw["tag"];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function POST(req: Request) {
  if (!authorized(req)) return jsonError(401, "API key fehlt oder ungültig");

  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return jsonError(400, "Body konnte nicht gelesen werden");
  }

  const email = pick(body, "your-email", "email", "e-mail", "mail", "newsletter-email");
  if (!email || !email.includes("@")) {
    return jsonError(400, "E-Mail-Adresse fehlt oder ungültig");
  }
  const firstName = pick(body, "first-name", "firstName", "vorname", "your-firstname");
  const lastName = pick(body, "last-name", "lastName", "nachname", "your-lastname");
  const fullName = pick(body, "your-name", "name");
  const company = pick(body, "company", "firma", "company-name");
  const source = pick(body, "source", "_source") || "cf7";

  let fn = firstName;
  let ln = lastName;
  if (!fn && fullName) {
    const parts = fullName.split(/\s+/);
    fn = parts.shift() ?? "";
    ln = parts.join(" ");
  }

  const xff = req.headers.get("x-forwarded-for") ?? "";
  const consentIp = xff.split(",")[0]?.trim() || null;

  try {
    const res = await subscribe({
      email,
      firstName: fn || null,
      lastName: ln || null,
      company: company || null,
      source,
      tags: parseTags(body),
      consentIp,
      consentSource: pick(body, "page-url", "_url", "referer") || req.headers.get("referer"),
    });
    return NextResponse.json({ ok: true, status: res.status }, { status: 201 });
  } catch (e: any) {
    return jsonError(422, e?.message ?? "Anmeldung fehlgeschlagen");
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST mit X-Api-Key. Felder: email (Pflicht), first-name, last-name, company, tags, source.",
  });
}
