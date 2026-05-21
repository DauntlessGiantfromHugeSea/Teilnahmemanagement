import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface MediaEntry {
  url: string;
  name: string;
  size: number;
  modifiedAt: Date;
}

const UPLOAD_BASE = "uploads";

/**
 * Listet alle hochgeladenen Dateien aus public/uploads (rekursiv durch
 * Monatsordner), sortiert nach Datum absteigend.
 */
export async function listMedia(): Promise<MediaEntry[]> {
  const root = join(process.cwd(), "public", UPLOAD_BASE);
  const entries: MediaEntry[] = [];
  let topLevel: string[] = [];
  try {
    topLevel = await readdir(root);
  } catch {
    return [];
  }
  for (const folder of topLevel) {
    const folderPath = join(root, folder);
    let folderStat;
    try {
      folderStat = await stat(folderPath);
    } catch {
      continue;
    }
    if (folderStat.isDirectory()) {
      let files: string[] = [];
      try {
        files = await readdir(folderPath);
      } catch {
        continue;
      }
      for (const file of files) {
        const filePath = join(folderPath, file);
        try {
          const s = await stat(filePath);
          if (!s.isFile()) continue;
          entries.push({
            url: `/${UPLOAD_BASE}/${folder}/${file}`,
            name: file,
            size: s.size,
            modifiedAt: s.mtime,
          });
        } catch {
          // ignorieren
        }
      }
    } else if (folderStat.isFile()) {
      // Datei direkt unter uploads/ (alte Struktur)
      entries.push({
        url: `/${UPLOAD_BASE}/${folder}`,
        name: folder,
        size: folderStat.size,
        modifiedAt: folderStat.mtime,
      });
    }
  }
  entries.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return entries;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
