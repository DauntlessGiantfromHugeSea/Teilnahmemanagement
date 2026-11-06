import { mkdir, writeFile, readdir, stat, unlink } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import crypto from "node:crypto";

// Hochgeladene Dateien liegen unter public/uploads und werden von derselben
// Herkunft ausgeliefert wie die Anwendung. Was hier landet, laeuft im
// Browser also im Sicherheitskontext der Anwendung. Deshalb gilt:
//
//   1. Der Dateityp wird aus dem Inhalt bestimmt, nicht aus den Angaben des
//      Hochladenden. Content-Type und Dateiname kommen vom Client und sind
//      frei waehlbar.
//   2. Die Endung ergibt sich aus dem erkannten Typ, nie aus dem Dateinamen.
//   3. SVG ist nicht zugelassen. SVG ist aktives Dokument, kein Bild: es
//      darf Skripte enthalten und wuerde als gespeichertes Script-Einschleusen
//      wirken.

/** Erkannte Bildformate. Reihenfolge egal, die Signaturen sind eindeutig. */
type ImageKind = "jpeg" | "png" | "webp" | "gif";

const KIND_MIME: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const KIND_EXT: Record<ImageKind, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB je Datei
/** Obergrenze fuer das gesamte Upload-Verzeichnis. */
export const MAX_UPLOADS_TOTAL_BYTES =
  Math.max(64, Number(process.env.UPLOADS_MAX_TOTAL_MB ?? 2048) || 2048) * 1024 * 1024;

export function uploadsRoot(): string {
  return join(process.cwd(), "public", "uploads");
}

/**
 * Bestimmt das Format anhand der Signatur am Dateianfang.
 * Gibt null zurueck, wenn es keines der zugelassenen Formate ist.
 */
export function detectImageKind(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (buf.subarray(0, 6).toString("latin1").match(/^GIF8[79]a$/)) return "gif";
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function sanitizeStem(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\.[^.]*$/, "") // vorhandene Endung verwerfen
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 48);
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

// Groesse des Upload-Verzeichnisses, hoechstens einmal pro Minute neu
// ermittelt. Ohne diese Schranke kann jeder angemeldete Benutzer die Platte
// vollschreiben - die einzige Upload-Route ohne Rollenpruefung ist die
// eigene Unterschrift.
let totalCache: { bytes: number; at: number } | null = null;

async function dirBytes(dir: string): Promise<number> {
  let sum = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sum += await dirBytes(p);
    else {
      try {
        sum += (await stat(p)).size;
      } catch {
        /* Datei inzwischen weg */
      }
    }
  }
  return sum;
}

export async function uploadsTotalBytes(force = false): Promise<number> {
  if (!force && totalCache && Date.now() - totalCache.at < 60_000) return totalCache.bytes;
  const bytes = await dirBytes(uploadsRoot());
  totalCache = { bytes, at: Date.now() };
  return bytes;
}

/**
 * Speichert eine hochgeladene Datei im public/uploads-Verzeichnis und gibt
 * die oeffentliche URL zurueck. Gibt null zurueck, wenn keine Datei kam.
 * Wirft bei zu grosser Datei, unzulaessigem Inhalt oder vollem Kontingent.
 */
export async function saveUpload(file: File | null | undefined): Promise<SavedUpload | null> {
  if (!file || typeof file === "string") return null;
  if (!file.size) return null;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Datei zu gross (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`);
  }

  const total = await uploadsTotalBytes();
  if (total + file.size > MAX_UPLOADS_TOTAL_BYTES) {
    throw new Error(
      "Der Speicher für Uploads ist ausgeschöpft. Bitte nicht mehr benötigte Bilder entfernen."
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Massgeblich ist der Inhalt. file.type und file.name sind Angaben des
  // Hochladenden und werden fuer die Entscheidung nicht herangezogen.
  const kind = detectImageKind(buf);
  if (!kind) {
    throw new Error("Unzulässiger Dateityp. Erlaubt sind JPEG, PNG, WebP und GIF.");
  }

  const folder = dateFolder();
  const stem = sanitizeStem(file.name || "") || "bild";
  const rand = crypto.randomBytes(8).toString("hex");
  const finalName = `${stem}-${rand}${KIND_EXT[kind]}`;
  const dir = join(uploadsRoot(), folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, finalName), buf);
  if (totalCache) totalCache.bytes += buf.length;

  return {
    url: `/uploads/${folder}/${finalName}`,
    filename: finalName,
    size: buf.length,
    type: KIND_MIME[kind],
  };
}

/**
 * Entfernt eine zuvor gespeicherte Datei. Erwartet die oeffentliche URL aus
 * saveUpload. Alles ausserhalb von public/uploads wird abgelehnt, damit ein
 * manipulierter Datenbankwert nicht in fremde Verzeichnisse zeigt.
 */
export async function deleteUpload(url: string | null | undefined): Promise<boolean> {
  if (!url || !url.startsWith("/uploads/")) return false;
  const rel = normalize(url.slice("/uploads/".length));
  if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`)) return false;
  const abs = join(uploadsRoot(), rel);
  if (!abs.startsWith(uploadsRoot() + sep)) return false;
  try {
    const info = await stat(abs);
    await unlink(abs);
    if (totalCache) totalCache.bytes = Math.max(0, totalCache.bytes - info.size);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prueft die angekuendigte Groesse, BEVOR req.formData() den gesamten Body
 * in den Speicher liest. Ohne diese Schranke laedt die Anwendung erst alles
 * hoch und lehnt danach ab - die Arbeit ist dann schon getan.
 */
export function bodyTooLarge(req: Request, max = MAX_UPLOAD_BYTES + 1024 * 1024): boolean {
  const len = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(len) && len > max;
}
