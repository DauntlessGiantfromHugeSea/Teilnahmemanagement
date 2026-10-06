// Zerlegt eine eingetippte oder eingefuegte Empfaengerliste in einzelne
// Adressen. Bewusst nachsichtig, weil die Zeilen aus ganz unterschiedlichen
// Quellen kommen - abgetippt, aus Outlook kopiert oder aus einer
// Excel-Spalte eingefuegt.
//
// Erkannt werden unter anderem:
//   max@example.com
//   Max Mustermann <max@example.com>
//   Mustermann, Max <max@example.com>
//   Max Mustermann; max@example.com
//   Max; Mustermann; max@example.com
//   a@x.de, b@y.de            (mehrere Adressen in einer Zeile)
//
// Keine Abhaengigkeit auf Node-Module, damit dieselbe Funktion auch im
// Browser fuer die Live-Vorschau laeuft.

export interface Recipient {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ParsedRecipients {
  recipients: Recipient[];
  /** Zeilen, in denen keine Adresse gefunden wurde (1-basierte Nummer + Text). */
  invalid: { line: number; text: string }[];
  /** Adressen, die mehrfach vorkamen und nur einmal uebernommen wurden. */
  duplicates: string[];
}

// Zum Finden innerhalb einer Zeile - Trennzeichen bleiben aussen vor.
const EMAIL_IN_TEXT = /[^\s<>,;"'()[\]]+@[^\s<>,;"'()[\]]+\.[^\s<>,;"'()[\]]+/g;
// Zum Pruefen einer fertig isolierten Adresse.
const EMAIL_EXACT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Titel und Anreden, die vor dem Vornamen stehen koennen. Ohne das Abtrennen
// wuerde aus "Dr. Hans Wagner" ein Vorname "Dr." - und die Mail begaenne mit
// "Hallo Dr.".
const TITLES = /^(herrn?|frau|dr\.?|prof\.?|dipl\.?[-\s]?ing\.?|ing\.?|mag\.?|m\.?sc\.?|b\.?sc\.?|med\.?|rer\.?|nat\.?|h\.?c\.?)$/i;

function splitName(raw: string): { firstName: string; lastName: string } {
  // Reste von Trennern und Anfuehrungszeichen entfernen.
  const name = raw
    .replace(/["'<>]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[;,\t|-]+|[;,\t|-]+$/g, "")
    .trim();
  if (!name) return { firstName: "", lastName: "" };

  // "Max; Mustermann" oder "Max,Mustermann" oder Tabulator (Excel-Spalten)
  const parts = name.split(/[;\t|]+|,(?=\s*\S)/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // "Mustermann, Max" ist im Deutschen Nachname zuerst - daran erkennbar,
    // dass im Original ein Komma stand und kein Semikolon/Tabulator.
    if (/,/.test(name) && !/[;\t|]/.test(name)) {
      return { firstName: parts[1], lastName: parts[0] };
    }
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  // Ein Block: fuehrende Titel weg, dann erstes Wort Vorname, Rest Nachname.
  let words = parts[0].split(/\s+/);
  while (words.length > 1 && TITLES.test(words[0])) words = words.slice(1);
  if (words.length === 1) return { firstName: words[0], lastName: "" };
  return { firstName: words[0], lastName: words.slice(1).join(" ") };
}

export function parseRecipients(input: string): ParsedRecipients {
  const recipients: Recipient[] = [];
  const invalid: { line: number; text: string }[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  const lines = (input ?? "").split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;

    const found = line.match(EMAIL_IN_TEXT) ?? [];
    const emails = found.filter((e) => EMAIL_EXACT.test(e));
    if (emails.length === 0) {
      invalid.push({ line: i + 1, text: line.slice(0, 80) });
      return;
    }

    // Nur bei genau einer Adresse laesst sich der Rest der Zeile sinnvoll als
    // Name deuten. Bei mehreren Adressen pro Zeile waere die Zuordnung Raterei.
    const name = emails.length === 1
      ? splitName(line.replace(emails[0], " "))
      : { firstName: "", lastName: "" };

    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (seen.has(email)) {
        if (!duplicates.includes(email)) duplicates.push(email);
        continue;
      }
      seen.add(email);
      recipients.push({ ...name, email });
    }
  });

  return { recipients, invalid, duplicates };
}
