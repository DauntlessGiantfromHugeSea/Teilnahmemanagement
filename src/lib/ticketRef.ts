import crypto from "node:crypto";

// Menschenlesbare Ticket-Referenz, z.B. FBA-7K2M9-4XQ1P.
//
// Alphabet ohne I/O/0/1 (Crockford-artig), damit die Referenz am Telefon
// vorgelesen und ohne Verwechslung abgetippt werden kann. Sie steht im
// Betreff und im Footer jeder Antwort - kommt eine Kundenmail zurueck, wird
// das Ticket darueber wiedergefunden, auch wenn die Mail-Header verloren
// gehen (z.B. weil jemand eine neue Mail schreibt statt zu antworten).

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GROUP = 5;

function prefix(): string {
  const raw = (process.env.TICKET_REF_PREFIX ?? "FBA").toUpperCase();
  const clean = raw.replace(/[^A-Z]/g, "");
  return clean.length >= 2 ? clean.slice(0, 4) : "FBA";
}

function group(): string {
  const bytes = crypto.randomBytes(GROUP);
  let out = "";
  for (let i = 0; i < GROUP; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Erzeugt eine neue Referenz. Eindeutigkeit garantiert erst die DB (unique). */
export function newTicketReference(): string {
  return `${prefix()}-${group()}-${group()}`;
}

/** Regex fuer das aktuelle Praefix, z.B. /\bFBA-[2-9A-Z]{5}-[2-9A-Z]{5}\b/ */
function referenceRegex(): RegExp {
  return new RegExp(`\\b${prefix()}-[${ALPHABET}]{${GROUP}}-[${ALPHABET}]{${GROUP}}\\b`, "i");
}

/**
 * Sucht eine Referenz in Betreff oder Body. Gibt sie normalisiert
 * (Grossbuchstaben) zurueck oder null.
 */
export function findTicketReference(...haystacks: (string | null | undefined)[]): string | null {
  const re = referenceRegex();
  for (const h of haystacks) {
    if (!h) continue;
    const m = h.match(re);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

/** Haengt "[REF]" an den Betreff, sofern nicht schon enthalten. */
export function subjectWithReference(subject: string, reference: string): string {
  const base = subject.trim() || "(ohne Betreff)";
  if (base.toUpperCase().includes(reference.toUpperCase())) return base;
  return `${base} [${reference}]`;
}

/** "Re: ..." voranstellen, ohne "Re: Re: Re:" zu produzieren. */
export function replySubject(subject: string): string {
  const base = (subject ?? "").trim();
  const stripped = base.replace(/^((re|aw|antw|wg|fwd|fw)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
  return `Re: ${stripped || "(ohne Betreff)"}`;
}
