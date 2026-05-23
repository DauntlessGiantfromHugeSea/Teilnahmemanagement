import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import crypto from "node:crypto";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    .slice(0, 60);
}

function dateFolder(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export interface SavedUpload {
  url: string; // /uploads/<yyyymm>/<filename>
  filename: string;
  size: number;
  type: string;
}

/**
 * Speichert eine hochgeladene Datei im public/uploads-Verzeichnis und
 * gibt die oeffentliche URL zurueck. Gibt null zurueck, wenn die Datei
 * leer ist oder den Typ/Groessen-Check nicht besteht.
 */
export async function saveUpload(file: File | null | undefined): Promise<SavedUpload | null> {
  if (!file || typeof file === "string") return null;
  if (!file.size) return null;
  if (file.size > MAX_BYTES) {
    throw new Error(`Datei zu gross (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`);
  }
  if (!ALLOWED.has(file.type)) {
    throw new Error(`Unzulaessiger Dateityp: ${file.type}`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const folder = dateFolder();
  const base = sanitizeFilename(file.name || "upload");
  const ext = extname(base) || extToExtension(file.type) || "";
  const stem = ext ? base.slice(0, -ext.length) : base;
  const rand = crypto.randomBytes(4).toString("hex");
  const finalName = `${stem || "img"}-${rand}${ext}`;
  const dir = join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, finalName), buf);
  return {
    url: `/uploads/${folder}/${finalName}`,
    filename: finalName,
    size: file.size,
    type: file.type,
  };
}

function extToExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg": return ".jpg";
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    case "image/gif": return ".gif";
    case "image/svg+xml": return ".svg";
    default: return "";
  }
}
