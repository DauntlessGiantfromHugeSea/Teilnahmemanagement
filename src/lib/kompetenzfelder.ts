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
