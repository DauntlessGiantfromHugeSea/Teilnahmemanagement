// Helpers fuer Wissenstest-Codes und Frageabfrage.
import crypto from "node:crypto";
import { prisma } from "./db";

// Kurzer, gut lesbarer Code: 6 Zeichen aus Alphabet ohne 0/O/1/I.
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(): string {
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += ALPHA[bytes[i] % ALPHA.length];
  return out;
}

export async function ensureResult(participantId: string): Promise<{ code: string; resultId: string }> {
  const existing = await prisma.wissenstestResult.findUnique({
    where: { participantId },
    select: { id: true, code: true },
  });
  if (existing) return { code: existing.code, resultId: existing.id };

  // bis zu 5 Versuche, einen freien Code zu finden
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const clash = await prisma.wissenstestResult.findUnique({ where: { code } });
    if (!clash) {
      const created = await prisma.wissenstestResult.create({
        data: { participantId, code },
      });
      return { code, resultId: created.id };
    }
  }
  throw new Error("Konnte keinen eindeutigen Code finden.");
}

export interface WissenstestQuestionPublic {
  id: string;
  text: string;
  options: string[];
  correctIdx: number | null;
}

export async function getActiveQuestions(): Promise<WissenstestQuestionPublic[]> {
  const rows = await prisma.wissenstestQuestion.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((q) => {
    let options: string[] = [];
    try { options = JSON.parse(q.options); if (!Array.isArray(options)) options = []; } catch { options = []; }
    return { id: q.id, text: q.text, options, correctIdx: q.correctIdx };
  });
}
