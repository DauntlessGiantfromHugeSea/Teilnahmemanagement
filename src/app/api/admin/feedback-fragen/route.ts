import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveDefaultQuestions, type FeedbackQuestion, type QuestionType } from "@/lib/feedback";

const TYPES: QuestionType[] = ["select", "text", "textarea", "checkboxes", "radio"];

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const count = Number(f.get("count") ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return back({ error: "Keine Fragen übermittelt." });
  }
  const out: FeedbackQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const id = String(f.get(`id_${i}`) ?? "").trim();
    const text = String(f.get(`text_${i}`) ?? "").trim();
    const type = String(f.get(`type_${i}`) ?? "text") as QuestionType;
    const description = String(f.get(`description_${i}`) ?? "").trim();
    const optionsRaw = String(f.get(`options_${i}`) ?? "");
    const options = optionsRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!id || !text) return back({ error: `Frage ${i + 1}: ID und Frage-Text sind Pflicht.` });
    if (!TYPES.includes(type)) return back({ error: `Frage ${i + 1}: ungültiger Typ.` });
    out.push({
      id,
      text,
      type,
      description: description || undefined,
      options: ["select", "radio", "checkboxes"].includes(type) ? options : undefined,
    });
  }
  await saveDefaultQuestions(out);
  return back({ ok: "Gespeichert." });
}

function back(q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/feedback-fragen?${new URLSearchParams(q).toString()}` },
  });
}
