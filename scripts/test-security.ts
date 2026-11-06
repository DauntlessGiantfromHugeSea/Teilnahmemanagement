// Prueft die Korrekturen aus dem Sicherheits-Audit, soweit sie ohne
// Datenbank und ohne Netz pruefbar sind:
//
//   npx tsx scripts/test-security.ts
//
// Abgedeckt: Dateityp-Erkennung und Pfadschutz bei Uploads, Begrenzung und
// Bereinigung von Fremd-HTML, CSV-Formelpraefixe, Microsoft-Verknuepfung,
// Graph-Postfach-Freigabe, Zertifikats-Slug sowie der Gleichlauf der
// Audience-Konstanten zwischen Middleware und Sitzungsverwaltung.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectImageKind, deleteUpload, bodyTooLarge, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { sanitizeIncomingHtml, stripQuotedReply, MAX_SANITIZE_CHARS } from "@/lib/mailHtml";
import { csvSafeValue, csvCell, toCsv } from "@/lib/csv";
import { msAutoLinkAllowed, msLinkTenants } from "@/lib/msAuth";
import { graphEnvFallbackAllowed } from "@/lib/msGraphMail";
import { numberToSlug, newCertificateSlug } from "@/lib/certificateContent";
import { AUD_SESSION, AUD_PENDING, AUD_CERT_PORTAL } from "@/lib/authAudience";

let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       erhalten: ${String(got)}`}`);
};

// ---------------------------------------------------------------- Uploads
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(16)]);
const webp = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "latin1"),
  Buffer.alloc(8),
]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const html = Buffer.from("<!doctype html><script>alert(1)</script>");

check("PNG erkannt", detectImageKind(png) === "png", detectImageKind(png));
check("JPEG erkannt", detectImageKind(jpeg) === "jpeg", detectImageKind(jpeg));
check("GIF erkannt", detectImageKind(gif) === "gif", detectImageKind(gif));
check("WebP erkannt", detectImageKind(webp) === "webp", detectImageKind(webp));
check("SVG abgelehnt", detectImageKind(svg) === null, detectImageKind(svg));
check("HTML abgelehnt", detectImageKind(html) === null, detectImageKind(html));
check("zu kurz abgelehnt", detectImageKind(Buffer.from([0x89, 0x50])) === null);
// Ein als PNG deklariertes HTML-Dokument darf nicht durchrutschen.
check("falsch deklariert abgelehnt", detectImageKind(Buffer.from("PNG<html>")) === null);

(async () => {
  check("Pfadausbruch abgelehnt", (await deleteUpload("/uploads/../../.env")) === false);
  check("absoluter Pfad abgelehnt", (await deleteUpload("/etc/passwd")) === false);
  check("leere URL abgelehnt", (await deleteUpload(null)) === false);
  check("nicht vorhandene Datei: false", (await deleteUpload("/uploads/202601/gibtsnicht.png")) === false);
})();

const bigReq = new Request("http://x/", {
  method: "POST",
  headers: { "content-length": String(MAX_UPLOAD_BYTES * 3) },
});
const smallReq = new Request("http://x/", { method: "POST", headers: { "content-length": "1024" } });
check("zu grosser Body erkannt", bodyTooLarge(bigReq) === true);
check("kleiner Body durchgelassen", bodyTooLarge(smallReq) === false);
check("ohne content-length durchgelassen", bodyTooLarge(new Request("http://x/")) === false);

// ------------------------------------------------------------- Mail-HTML
const dirty = `<p>Hallo</p><script>fetch('//b.example')</script><style>b{}</style>
<img src=x onerror="alert(1)"><a href="javascript:alert(1)">klick</a>
<svg><desc>x</desc></svg><!--[if IE]><script>x</script><![endif]-->`;
const clean = sanitizeIncomingHtml(dirty);
check("script entfernt", !/<script/i.test(clean), clean);
check("style entfernt", !/<style/i.test(clean), clean);
check("svg entfernt", !/<svg/i.test(clean), clean);
check("onerror entfernt", !/onerror/i.test(clean), clean);
check("javascript: entschaerft", !/javascript:/i.test(clean), clean);
check("Kommentar entfernt", !clean.includes("<!--"), clean);
check("Nutztext bleibt", clean.includes("Hallo"), clean);

// Gross- und Kleinschreibung darf die Sperre nicht aushebeln.
const mixed = sanitizeIncomingHtml("<ScRiPt>alert(1)</ScRiPt><IFRAME src=x></IFRAME>");
check("Gross/Klein: script entfernt", !/script/i.test(mixed), mixed);
check("Gross/Klein: iframe entfernt", !/iframe/i.test(mixed), mixed);

// Begrenzung: eine sehr grosse Mail darf die Verarbeitung nicht aufhalten.
const huge = "<p>a</p>".repeat(400_000); // ~3,2 MB
const t0 = Date.now();
const cut = sanitizeIncomingHtml(huge);
const dt = Date.now() - t0;
check("grosse Mail gekuerzt", cut.length < MAX_SANITIZE_CHARS + 500, cut.length);
check("Kuerzungshinweis vorhanden", cut.includes("gekürzt"), cut.slice(-120));
check(`grosse Mail schnell verarbeitet (${dt} ms)`, dt < 1000, dt);

const hugeText = "Zeile\n".repeat(200_000);
const cutText = stripQuotedReply(hugeText);
check("Plaintext gekuerzt", cutText.length < MAX_SANITIZE_CHARS + 200, cutText.length);
check("leerer Text bleibt leer", stripQuotedReply("") === "");
check(
  "Zitat wird abgeschnitten",
  stripQuotedReply("Meine Frage\n\nVon: jemand\n> altes Zeug") === "Meine Frage"
);

// ------------------------------------------------------------------- CSV
check("Gleichheitszeichen entschaerft", csvSafeValue("=1+1") === "'=1+1");
check("Plus entschaerft", csvSafeValue("+49 170") === "'+49 170");
check("Minus entschaerft", csvSafeValue("-5") === "'-5");
check("At entschaerft", csvSafeValue("@SUM(A1)") === "'@SUM(A1)");
check("Tabulator entschaerft", csvSafeValue("\tx") === "'\tx");
check("normaler Text unveraendert", csvSafeValue("Müller") === "Müller");
check("Mail-Adresse unveraendert", csvSafeValue("a@b.de") === "a@b.de");
check("Semikolon wird gequotet", csvCell("a;b") === '"a;b"');
check("Anfuehrungszeichen verdoppelt", csvCell('a"b') === '"a""b"');
check(
  "Formel in Zelle entschaerft und gequotet",
  csvCell('=HYPERLINK("http://x";"klick")') === `"'=HYPERLINK(""http://x"";""klick"")"`,
  csvCell('=HYPERLINK("http://x";"klick")')
);
check("BOM vorangestellt", toCsv([["a"]]).startsWith("﻿"));
check("Zeilen mit CRLF getrennt", toCsv([["a"], ["b"]]).endsWith("a\r\nb"));

// ------------------------------------------------------ Microsoft-Anmeldung
const EIGEN = "e47a6b12-0ae0-4db5-a6ee-ec4186b11bb0";
const FREMD = "11111111-2222-3333-4444-555555555555";
const PRIVAT = "9188040d-6c67-4c5b-b112-36a304b66dad";

process.env.MS_LINK_TENANTS = "";
process.env.MS_TENANT_ID = EIGEN;
check("eigener Tenant darf verknuepfen", msAutoLinkAllowed(EIGEN) === true);
check("fremder Tenant darf nicht", msAutoLinkAllowed(FREMD) === false);
check("privates Konto darf nicht", msAutoLinkAllowed(PRIVAT) === false);
check("leerer Tenant darf nicht", msAutoLinkAllowed("") === false);
check("Gross/Kleinschreibung egal", msAutoLinkAllowed(EIGEN.toUpperCase()) === true);

process.env.MS_TENANT_ID = "common";
check('"common" erlaubt keine Verknuepfung', msAutoLinkAllowed(EIGEN) === false);
check('"common" ergibt leere Liste', msLinkTenants().length === 0);

process.env.MS_LINK_TENANTS = `${EIGEN}, ${FREMD}`;
check("ausdrueckliche Liste gilt", msAutoLinkAllowed(FREMD) === true);
process.env.MS_LINK_TENANTS = "";
process.env.MS_TENANT_ID = EIGEN;

// --------------------------------------------------- Graph-Postfachfreigabe
process.env.MS_GRAPH_MAILBOXES = "";
check("ohne Freigabeliste kein Rueckfall", graphEnvFallbackAllowed("info@fb-akademie.de") === false);
process.env.MS_GRAPH_MAILBOXES = "schulung@fb-akademie.de info@fb-akademie.de";
check("freigegebenes Postfach", graphEnvFallbackAllowed("info@fb-akademie.de") === true);
check("Gross/Klein egal", graphEnvFallbackAllowed("INFO@FB-Akademie.de") === true);
check("fremdes Postfach abgelehnt", graphEnvFallbackAllowed("chef@fb-akademie.de") === false);
check("Leerstring abgelehnt", graphEnvFallbackAllowed("") === false);

// ------------------------------------------------------- Zertifikats-Slug
const nummer = "26-TN-LM-26/230";
check("Bestands-Slug bleibt berechenbar", numberToSlug(nummer) === "26-TN-LM-26-230");
const s1 = newCertificateSlug(nummer);
const s2 = newCertificateSlug(nummer);
check("neuer Slug beginnt mit der Nummer", s1.startsWith("26-TN-LM-26-230-"), s1);
check("neuer Slug enthaelt Zufall", s1 !== s2, `${s1} / ${s2}`);
check("Zufallsanteil lang genug", s1.length - "26-TN-LM-26-230-".length === 10, s1);
check("Slug ist URL-tauglich", /^[A-Za-z0-9-]+$/.test(s1), s1);

// -------------------------------------- Audience-Konstanten im Gleichlauf
// Beide Seiten muessen dieselben Werte verwenden. Laufen sie auseinander,
// wird jede Sitzung abgewiesen.
const mw = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf8");
check(
  "Middleware nutzt die gemeinsamen Audience-Konstanten",
  mw.includes('from "./lib/authAudience"'),
  mw.split("\n").slice(0, 12).join(" | ")
);
check("Middleware prueft die Session-Audience", mw.includes("audience: AUD_SESSION"));
check("Middleware prueft die Pending-Audience", mw.includes("audience: AUD_PENDING"));
check("drei verschiedene Audiences", new Set([AUD_SESSION, AUD_PENDING, AUD_CERT_PORTAL]).size === 3);

// -------------------------------------- Kein Standardpasswort im Repository
for (const f of [
  "prisma/seed.ts",
  "scripts/create-admin.cjs",
  "docker-compose.yml",
  ".env.docker.example",
  "README.md",
]) {
  const txt = readFileSync(join(process.cwd(), f), "utf8");
  check(`${f} ohne eingechecktes Standardpasswort`, !/ChangeMe!/.test(txt));
}

setTimeout(() => {
  console.log(fails === 0 ? "\nAlle Pruefungen bestanden." : `\n${fails} Pruefung(en) fehlgeschlagen.`);
  process.exit(fails === 0 ? 0 : 1);
}, 50);
