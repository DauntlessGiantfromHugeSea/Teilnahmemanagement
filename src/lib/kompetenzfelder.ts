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

// --- Globaler fortlaufender Sequenzzaehler ---
const KEY_SEQ = "certSeq";

export async function nextSequence(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY_SEQ } });
  let current = 0;
  if (row) {
    const n = parseInt(row.value, 10);
    if (Number.isFinite(n)) current = n;
  } else {
    // Bootstrap: Maximum aus bestehenden Zertifikatsnummern lesen.
    const all = await prisma.certificate.findMany({ select: { number: true } });
    for (const c of all) {
      const m = c.number.match(/\/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > current) current = n;
      }
    }
  }
  const next = current + 1;
  await prisma.appSetting.upsert({
    where: { key: KEY_SEQ },
    create: { key: KEY_SEQ, value: String(next) },
    update: { value: String(next) },
  });
  return next;
}

export async function setNextSequence(n: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY_SEQ },
    create: { key: KEY_SEQ, value: String(Math.max(0, n - 1)) },
    update: { value: String(Math.max(0, n - 1)) },
  });
}
