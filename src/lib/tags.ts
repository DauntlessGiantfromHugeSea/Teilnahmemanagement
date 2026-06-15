// Tag-/Kategorie-Logik fuer Teilnehmer.
//
// - companyHash: HMAC-SHA-256 ueber den normalisierten Firmennamen
//   (lowercase, Leerzeichen/Sonderzeichen reduziert). Erlaubt Lookups
//   ohne Klartext und ist stabil unabhaengig vom verschluesselten
//   company-Feld.
// - propagateTagsByCompany: wenn ein anderer Teilnehmer mit demselben
//   companyHash bereits Tags hat, werden sie auf den neuen Teilnehmer
//   uebertragen (autoAssigned=true) - nur Tags die noch nicht vorhanden
//   sind.

import { prisma } from "./db";
import { blindIndex } from "./crypto";

export const DEFAULT_TAGS: { name: string; color: string }[] = [
  { name: "Planer", color: "#0ea5e9" },
  { name: "Baugrundgutachter", color: "#22c55e" },
  { name: "Baufirma", color: "#f97316" },
  { name: "Flüssigbodenhersteller", color: "#0f766e" },
  { name: "Gerätehersteller", color: "#8b5cf6" },
];

export function companyHashOf(company: string | null | undefined): string | null {
  if (!company) return null;
  const norm = company
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!norm) return null;
  return blindIndex(norm);
}

export async function ensureDefaultTags(): Promise<void> {
  const existing = await prisma.tag.count();
  if (existing > 0) return;
  for (let i = 0; i < DEFAULT_TAGS.length; i++) {
    const t = DEFAULT_TAGS[i];
    await prisma.tag.create({ data: { name: t.name, color: t.color, position: (i + 1) * 10 } });
  }
}

// Sucht andere Teilnehmer mit demselben companyHash und uebertraegt deren
// (manuell + auto) Tags auf den uebergebenen Teilnehmer. Existierende Tags
// werden nicht doppelt vergeben.
export async function propagateTagsByCompany(participantId: string): Promise<number> {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, companyHash: true, tagLinks: { select: { tagId: true } } },
  });
  if (!p || !p.companyHash) return 0;

  const otherLinks = await prisma.participantTagLink.findMany({
    where: {
      participantId: { not: p.id },
      participant: { companyHash: p.companyHash },
    },
    select: { tagId: true },
  });
  if (otherLinks.length === 0) return 0;

  const haveTagIds = new Set(p.tagLinks.map((l) => l.tagId));
  const propose = new Set(otherLinks.map((l) => l.tagId).filter((id) => !haveTagIds.has(id)));
  if (propose.size === 0) return 0;

  let added = 0;
  for (const tagId of propose) {
    try {
      await prisma.participantTagLink.create({
        data: { participantId: p.id, tagId, autoAssigned: true },
      });
      added++;
    } catch { /* unique violation - ignore */ }
  }
  return added;
}
