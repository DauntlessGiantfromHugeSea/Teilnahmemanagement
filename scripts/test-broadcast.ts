// Prueft Adressliste, Textsatz und Layout der Rundmail.
// Reine Funktionen, keine Datenbank, kein Netz:
//
//   npx tsx scripts/test-broadcast.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chunk, parseAddressList } from "@/lib/broadcast";
import {
  fillPlaceholders,
  markupToHtml,
  markupToText,
  renderBroadcastHtml,
} from "@/lib/broadcastMail";
import { DEFAULT_COMPANY_SIGNATURE, type CompanySignature } from "@/lib/mailSignature";

let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       erhalten: ${String(got)}`}`);
};

// ------------------------------------------------------------ Adressliste
{
  const r = parseAddressList("maria@firma.de, thomas@firma.de; anna@firma.de");
  check("Komma und Semikolon trennen", r.valid.length === 3, r.valid);
}
{
  const r = parseAddressList("a@x.de\nb@x.de\r\nc@x.de");
  check("Zeilenumbrueche trennen", r.valid.length === 3, r.valid);
}
{
  const r = parseAddressList("Maria Schmidt <maria@firma.de>");
  check("Anzeigename wird entfernt", r.valid[0] === "maria@firma.de", r.valid);
}
{
  const r = parseAddressList("mailto:info@firma.de");
  check("mailto: wird entfernt", r.valid[0] === "info@firma.de", r.valid);
}
{
  const r = parseAddressList("Maria@Firma.DE, maria@firma.de");
  check("Dublette unabhaengig von Gross/Klein", r.valid.length === 1 && r.duplicates === 1, r);
  check("Adresse kleingeschrieben", r.valid[0] === "maria@firma.de", r.valid);
}
{
  const r = parseAddressList("gut@firma.de, kaputt, auch@kaputt");
  check("gueltige erkannt", r.valid.length === 1, r.valid);
  check("ungueltige gesammelt", r.invalid.length === 2, r.invalid);
}
{
  const r = parseAddressList("");
  check("leere Eingabe ergibt nichts", r.valid.length === 0 && r.invalid.length === 0);
}
{
  // So sieht eine aus Outlook kopierte Zeile aus.
  const r = parseAddressList("Weber, Anna <anna@x.de>; Müller, Tom <tom@x.de>");
  check("Outlook-Format", r.valid.length === 2 && r.valid.includes("anna@x.de"), r.valid);
}

check("chunk teilt auf", JSON.stringify(chunk([1, 2, 3, 4, 5], 2)) === "[[1,2],[3,4],[5]]");
check("chunk bei leerer Liste", chunk([], 10).length === 0);

// --------------------------------------------------------------- Textsatz
{
  const html = markupToHtml("Hallo <script>alert(1)</script> Welt");
  check("spitze Klammern werden escapt", !html.includes("<script>"), html);
  check("Text bleibt lesbar", html.includes("&lt;script&gt;"), html);
}
{
  const html = markupToHtml("Das ist **wichtig**.");
  check("fett wird gesetzt", html.includes("<strong"), html);
}
{
  const html = markupToHtml("Mehr unter https://fb-akademie.de/webinar dazu.");
  check("nackte URL verlinkt", html.includes('href="https://fb-akademie.de/webinar"'), html);
  check("Satzpunkt bleibt draussen", !html.includes('webinar."'), html);
}
{
  const html = markupToHtml("Schreiben Sie an info@fb-akademie.de.");
  check("Mailadresse verlinkt", html.includes('href="mailto:info@fb-akademie.de"'), html);
}
{
  const html = markupToHtml("[Zur Anmeldung](https://fb-akademie.de/a)");
  check("benannter Link", html.includes(">Zur Anmeldung</a>"), html);
  check("Linkziel gesetzt", html.includes('href="https://fb-akademie.de/a"'), html);
}
{
  // Ein gefaehrliches Schema darf nicht zu einem Link werden.
  const html = markupToHtml("[Klick](javascript:alert(1))");
  check("javascript: wird nicht verlinkt", !html.includes("<a "), html);
}
{
  // Die Automatik darf nicht in einen bereits gebauten Link hineingreifen.
  const html = markupToHtml("[Seite](https://x.de/pfad)");
  check("kein doppelter Anker", (html.match(/<a /g) ?? []).length === 1, html);
}
{
  const html = markupToHtml("Absatz eins.\n\nAbsatz zwei.");
  check("zwei Absaetze", (html.match(/<p /g) ?? []).length === 2, html);
}
{
  const html = markupToHtml("Zeile eins\nZeile zwei");
  check("einfacher Umbruch wird <br>", html.includes("<br>"), html);
}
{
  const html = markupToHtml("- Punkt eins\n- Punkt zwei");
  check("Aufzaehlung", html.includes("<ul") && (html.match(/<li/g) ?? []).length === 2, html);
}
{
  const html = markupToHtml("# Überschrift\n\nText");
  check("Ueberschrift", html.includes("<h2"), html);
  check("Raute verschwindet", !html.includes("# Überschrift"), html);
}
{
  const html = markupToHtml("", "#123456");
  check("leerer Text ergibt leeres HTML", html === "", html);
}
{
  const html = markupToHtml("Link: https://x.de", "#aa0000");
  check("Akzentfarbe im Link", html.includes("color:#aa0000"), html);
}

check(
  "Textfassung ohne Auszeichnung",
  markupToText("# Titel\n\n**fett** und [Text](https://x.de)") ===
    "Titel\n\nfett und Text: https://x.de",
  markupToText("# Titel\n\n**fett** und [Text](https://x.de)")
);

// ------------------------------------------------------------ Platzhalter
check(
  "Platzhalter ersetzt",
  fillPlaceholders("Hallo {firstName} {lastName}", { firstName: "Maria", lastName: "Schmidt" }) ===
    "Hallo Maria Schmidt"
);
check(
  "unbekannter Platzhalter wird geleert",
  fillPlaceholders("Hallo {gibtsNicht}!", {}) === "Hallo !"
);

// ----------------------------------------------------------------- Layout
const company: CompanySignature = {
  ...DEFAULT_COMPANY_SIGNATURE,
  accentColor: "#5f6f52",
  headerStyle: "band",
  footerName: "Flüssigboden Akademie",
  footerEmail: "info@fb-akademie.de",
  logoUrl: "https://example.com/logo.png",
  logoWidth: 180,
};

{
  const html = renderBroadcastHtml({
    company,
    bodyHtml: markupToHtml("Hallo zusammen", company.accentColor),
    preheader: "Terminänderung",
  });
  check("Kopfband in Akzentfarbe", html.includes("background:#5f6f52"), "");
  check("Logo im Kopf", html.includes('src="https://example.com/logo.png"'), "");
  check("Logobreite gesetzt", html.includes('width="180"'), "");
  check(
    "Fusszeile mit Jahr und Name",
    html.includes(`&copy; ${new Date().getFullYear()} Flüssigboden Akademie`),
    ""
  );
  check("Kontaktadresse in der Fusszeile", html.includes("mailto:info@fb-akademie.de"), "");
  check("Vorschautext versteckt", html.includes("Terminänderung") && html.includes("display:none"), "");
  check("keine Schaltflaeche ohne Angabe", !html.includes("border-radius:8px;background:"), "");
  check("vollstaendiges Dokument", html.startsWith("<!doctype html>") && html.includes("</html>"), "");
}
{
  const html = renderBroadcastHtml({
    company,
    bodyHtml: "<p>x</p>",
    ctaLabel: "Jetzt teilnehmen",
    ctaUrl: "https://teams.microsoft.com/l/abc",
  });
  check("Schaltflaeche gesetzt", html.includes("Jetzt teilnehmen"), "");
  check("Schaltflaechenziel", html.includes('href="https://teams.microsoft.com/l/abc"'), "");
}
{
  const html = renderBroadcastHtml({
    company,
    bodyHtml: "<p>x</p>",
    ctaLabel: "Klick",
    ctaUrl: "javascript:alert(1)",
  });
  check("gefaehrliches Schaltflaechenziel verworfen", !html.includes("javascript:"), "");
}
{
  // Kopfbereich: farbiges Band
  const band = renderBroadcastHtml({
    company: { ...company, headerStyle: "band" },
    bodyHtml: "<p>x</p>",
  });
  check("Band: Logo liegt auf der Akzentfarbe", band.includes("background:#5f6f52;padding:28px"), "");
  check("Band: kein zusaetzlicher Streifen", !band.includes("height:3px;background:#5f6f52"), "");

  // Kopfbereich: weiss mit Streifen
  const plain = renderBroadcastHtml({
    company: { ...company, headerStyle: "plain" },
    bodyHtml: "<p>x</p>",
  });
  check("Weiss: Logo auf weissem Grund", plain.includes("background:#ffffff;padding:30px"), "");
  check("Weiss: Farbstreifen darunter", plain.includes("height:3px;background:#5f6f52"), "");
}
{
  const ohneLogo = renderBroadcastHtml({
    company: { ...company, logoUrl: "", headerStyle: "band" },
    bodyHtml: "<p>x</p>",
  });
  check("ohne Logo steht der Name im Kopf", ohneLogo.includes(">Flüssigboden Akademie</span>"), "");
}
{
  const html = renderBroadcastHtml({
    company,
    bodyHtml: "<p>x</p>",
    footerNote: "Sie erhalten diese Nachricht als angemeldeter Teilnehmer.",
  });
  check("Fussnote erscheint", html.includes("als angemeldeter Teilnehmer"), "");
}
{
  // Relative Logo-Pfade muessen fuer Mailclients absolut werden.
  process.env.APP_URL = "https://teilnahme.fb-akademie.de";
  const html = renderBroadcastHtml({
    company: { ...company, logoUrl: "/uploads/202601/logo-abc.png" },
    bodyHtml: "<p>x</p>",
  });
  check(
    "relativer Logopfad wird absolut",
    html.includes('src="https://teilnahme.fb-akademie.de/uploads/202601/logo-abc.png"'),
    ""
  );
}

// ------------------------------------------- Test oder echter Versand?
//
// Hier steckte ein Fehler, der still das Falsche tat: Der Klick auf
// "An N Empfaenger senden" verschickte eine Testmail an einen selbst.
// Zwei Ursachen, beide durch setSending(true) beim Absenden ausgeloest:
//
//   1. name/value am Knopf - beim erneuten Rendern wird der Knopf
//      deaktiviert, und deaktivierte Felder schickt der Browser nicht mit.
//   2. <input type="hidden" defaultValue="test"> - bei einem versteckten
//      Feld ist value laut HTML-Standard dasselbe wie defaultValue, React
//      schreibt es beim erneuten Rendern also zurueck.
//
// Beides laesst sich ohne Browser nicht nachstellen. Diese Pruefungen sind
// deshalb bewusst grob: Sie lesen den Quelltext und schlagen an, sobald
// eine der beiden Schreibweisen zurueckkehrt.
{
  const composer = readFileSync(
    join(process.cwd(), "src", "components", "BroadcastComposer.tsx"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src", "app", "api", "mailing", "send", "route.ts"),
    "utf8"
  );

  check(
    "Falle 1: kein name=\"action\" am Knopf",
    !/<button[^>]*name="action"/s.test(composer),
    "Knopf traegt die Angabe wieder selbst - sie faellt weg, sobald er deaktiviert wird"
  );
  check(
    "Falle 2: verstecktes Feld ist verwaltet",
    /name="action"[^>]*value=\{action\}/.test(composer),
    "verstecktes Feld haengt nicht mehr am Zustand - React setzt es beim Rendern zurueck"
  );
  check(
    "Falle 2: kein defaultValue am versteckten Feld",
    !/name="action"[^>]*defaultValue/.test(composer),
    "defaultValue wird beim erneuten Rendern zurueckgeschrieben"
  );
  check(
    "Server faellt nicht still auf \"test\" zurueck",
    !/f\.get\("action"\)\s*\?\?\s*"test"/.test(route),
    "fehlende Angabe wuerde wieder still zur Testmail werden"
  );
  check(
    "Server weist unbekannte Angabe ab",
    /action !== "test" && action !== "send"/.test(route),
    "unbekannte Angabe wird nicht abgewiesen"
  );
}

console.log(
  fails === 0 ? "\nAlle Pruefungen bestanden." : `\n${fails} Pruefung(en) fehlgeschlagen.`
);
process.exit(fails === 0 ? 0 : 1);
