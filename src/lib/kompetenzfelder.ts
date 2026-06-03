// Liest die Kompetenzfelder aus AppSetting (Schluessel "certKompetenzfelder").
// Fallback: die fest verdrahteten Standard-Texte aus certificateContent.ts.
//
// Diese Funktion ist async und sollte serverseitig in Aktionen verwendet
// werden, die Zertifikate erzeugen (build snapshot) oder das Editor-UI laden.

import { prisma } from "./db";
import { KOMPETENZFELDER, type CertificateData } from "./certificateContent";

const KEY = "certKompetenzfelder";

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
export async function resolveKompetenzfelder(ids: string[]): Promise<CertificateData["kompetenzfelder"]> {
  const all = await getKompetenzfelder();
  const byId = new Map(all.map((k) => [k.id, k]));
  return ids.map((id) => byId.get(id)).filter((x): x is Kompetenzfeld => !!x);
}
