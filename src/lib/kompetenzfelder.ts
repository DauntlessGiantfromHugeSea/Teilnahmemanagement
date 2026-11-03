// Liest die Kompetenzfelder aus AppSetting (Schluessel "certKompetenzfelder").
// Fallback: die fest verdrahteten Standard-Texte aus certificateContent.ts.
//
// Diese Funktion ist async und sollte serverseitig in Aktionen verwendet
// werden, die Zertifikate erzeugen (build snapshot) oder das Editor-UI laden.

import { prisma } from "./db";
import { KOMPETENZFELDER, DEFAULT_CERT_TEXTS, type CertTexts } from "./certificateContent";

const KEY = "certKompetenzfelder";
const KEY_TEXTS = "certTexts";

export type Kompetenzfeld = (typeof KOMPETENZFELDER)[number];

let cache: { ts: number; data: Kompetenzfeld[] } | null = null;
const TTL_MS = 60_000;

export async function getKompetenzfelder(): Promise<Kompetenzfeld[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  let data: Kompetenzfeld[] = KOMPETENZFELDER as unknown as Kompetenzfeld[];
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) data = parsed;
    } catch {
      /* defaults */
    }
  }
  cache = { ts: Date.now(), data };
  return data;
}

export async function saveKompetenzfelder(items: Kompetenzfeld[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(items) },
    update: { value: JSON.stringify(items) },
  });
  cache = null;
}

export async function getKompetenzfeldById(id: string): Promise<Kompetenzfeld | null> {
  const all = await getKompetenzfelder();
  return all.find((k) => k.id === id) ?? null;
}

// Aufloesen einer Liste von IDs in die aktuell gespeicherten Inhalte.
export async function resolveKompetenzfelder(ids: string[]): Promise<Kompetenzfeld[]> {
  const all = await getKompetenzfelder();
  const byId = new Map(all.map((k) => [k.id, k]));
  return ids.map((id) => byId.get(id)).filter((x): x is Kompetenzfeld => !!x);
}

// --- CertTexts ---
let textsCache: { ts: number; data: CertTexts } | null = null;

export async function getCertTexts(): Promise<CertTexts> {
  if (textsCache && Date.now() - textsCache.ts < TTL_MS) return textsCache.data;
  const row = await prisma.appSetting.findUnique({ where: { key: KEY_TEXTS } });
  let data: CertTexts = { ...DEFAULT_CERT_TEXTS };
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      data = { ...DEFAULT_CERT_TEXTS, ...parsed };
    } catch { /* defaults */ }
  }
  textsCache = { ts: Date.now(), data };
  return data;
}

export async function saveCertTexts(t: Partial<CertTexts>): Promise<void> {
  const current = await getCertTexts();
  const merged = { ...current, ...t };
  await prisma.appSetting.upsert({
    where: { key: KEY_TEXTS },
    create: { key: KEY_TEXTS, value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  textsCache = null;
}

// --- Fortlaufende Sequenzzaehler PRO TYP ---
//
// Z-Zertifikate und Teilnahmebescheinigungen verwenden unterschiedliche
// Nummernformate und damit separate Counter. Bestehend ausgestellte Nummern
// werden niemals neu vergeben - der Counter springt beim Bootstrap auf das
// Maximum der bereits in der DB vorhandenen Nummern dieses Typs.

const SEQ_KEY: Record<"ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG", string> = {
  ZERTIFIKAT: "certSeqZ",
  TEILNAHMEBESCHEINIGUNG: "certSeqTN",
};

async function bootstrapFromDb(type: "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG"): Promise<number> {
  const all = await prisma.certificate.findMany({
    where: { type },
    select: { number: true },
  });
  let max = -1;
  for (const c of all) {
    const m = c.number.match(/\/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max; // -1 wenn nichts vorhanden
}

export async function nextSequence(type: "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG"): Promise<number> {
  const key = SEQ_KEY[type];
  const row = await prisma.appSetting.findUnique({ where: { key } });
  let current: number;
  if (row) {
    const n = parseInt(row.value, 10);
    current = Number.isFinite(n) ? n : await bootstrapFromDb(type);
  } else {
    current = await bootstrapFromDb(type);
  }
  const next = current + 1;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: String(next) },
    update: { value: String(next) },
  });
  return next;
}

// Hebt den Counter auf mindestens 'minValue' an (idempotent), damit nach einem
// Import keine alten Nummern noch einmal vergeben werden.
export async function bumpSequenceTo(type: "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG", minValue: number): Promise<void> {
  const key = SEQ_KEY[type];
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const current = row ? parseInt(row.value, 10) : -1;
  if (!Number.isFinite(current) || current < minValue) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: String(minValue) },
      update: { value: String(minValue) },
    });
  }
}

// --- Formularauswertung -----------------------------------------------------
// Bewusst als reine Funktion ohne Datenbank- oder Request-Bezug, damit sie
// unabhaengig von Next.js geprueft werden kann.

export interface KompetenzfeldFormRow {
  id: string;
  label: string;
  text: string;
}

// Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.
// Anfang und Ende muessen Buchstabe oder Ziffer sein.
const ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Macht aus den Formularzeilen die zu speichernde Liste.
 *
 * - Vollstaendig leere Zeilen werden uebersprungen (das ist der Platz fuer
 *   ein neues Feld, wenn er nicht benutzt wurde).
 * - `deleteId` entfernt genau diese Zeile; die uebrigen behalten ihre im
 *   Formular stehenden Werte, damit gleichzeitige Textaenderungen erhalten
 *   bleiben.
 * - Halb ausgefuellte Zeilen, ungueltige oder doppelte IDs sind Fehler.
 */
export function parseKompetenzfelderForm(
  rows: KompetenzfeldFormRow[],
  deleteId?: string | null
): { items: Kompetenzfeld[] } | { error: string } {
  const items: Kompetenzfeld[] = [];
  const seen = new Map<string, number>();
  const del = (deleteId ?? "").trim();

  for (let i = 0; i < rows.length; i++) {
    const id = (rows[i].id ?? "").trim();
    const label = (rows[i].label ?? "").trim();
    const text = (rows[i].text ?? "").trim();

    if (!id && !label && !text) continue;
    if (del && id === del) continue;

    if (!id || !label || !text) {
      const wo = id ? `„${id}"` : `Zeile ${i + 1}`;
      return {
        error:
          `${wo}: ID, Bezeichnung und Bestätigungstext sind alle drei Pflicht. ` +
          `Zum Anlegen bitte alle drei ausfüllen, zum Überspringen alle drei leer lassen.`,
      };
    }
    if (!ID_PATTERN.test(id)) {
      return {
        error:
          `„${id}" ist keine gültige ID. Erlaubt sind Buchstaben, Ziffern, Punkt, ` +
          `Bindestrich und Unterstrich; Anfang und Ende müssen Buchstabe oder Ziffer sein.`,
      };
    }
    const vorher = seen.get(id.toLowerCase());
    if (vorher !== undefined) {
      return {
        error: `Die ID „${id}" ist doppelt vergeben (Zeile ${vorher + 1} und ${i + 1}). IDs müssen eindeutig sein.`,
      };
    }
    seen.set(id.toLowerCase(), i);
    items.push({ id, label, text });
  }

  if (items.length === 0) {
    return { error: "Es muss mindestens ein Kompetenzfeld übrig bleiben." };
  }
  return { items };
}
