// Aufbereitung von Mail-Inhalten.
//
// Eingehendes HTML stammt von Dritten und wird deshalb zweifach entschaerft:
// hier serverseitig durch eine Allowlist-Bereinigung und in der Oberflaeche
// zusaetzlich durch die Anzeige in einem <iframe sandbox>. Beides zusammen,
// weil eine Regex-Bereinigung allein nie vollstaendig ist.

const BLOCKED_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "link",
  "meta",
  "base",
  "svg",
  "math",
  "frame",
  "frameset",
  "noscript",
];

/**
 * Obergrenze fuer den zu bereinigenden Text.
 *
 * Der Inhalt stammt von Dritten und ist in der Groesse nicht begrenzt -
 * Exchange nimmt Mails bis in den zweistelligen Megabyte-Bereich an. Die
 * Bereinigung laeuft als Regex-Kette ueber die gesamte Zeichenkette; bei
 * einer 20-MB-Mail blockiert das die Event-Loop und damit die ganze
 * Anwendung, nicht nur den Postfachabruf. Was darueber liegt, wird
 * abgeschnitten: Die Originalmail bleibt im Postfach, im Vorgang steht ein
 * sichtbarer Hinweis.
 */
export const MAX_SANITIZE_CHARS = 512 * 1024;

const TAG_ALTERNATION = BLOCKED_TAGS.join("|");
// Ein Durchlauf statt einer je Tag: die Rueckwaertsreferenz \1 sorgt dafuer,
// dass oeffnendes und schliessendes Tag zusammenpassen.
const BLOCKED_ELEMENTS = new RegExp(
  `<(${TAG_ALTERNATION})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  "gi"
);
const BLOCKED_SINGLE_TAGS = new RegExp(`<\\/?(?:${TAG_ALTERNATION})\\b[^>]*>`, "gi");

export const TRUNCATED_NOTE =
  '<p style="margin:12px 0;color:#b45309;font-size:13px;">[Nachricht gekürzt – die vollständige Mail liegt im Postfach.]</p>';

export function sanitizeIncomingHtml(html: string): string {
  if (!html) return "";
  const truncated = html.length > MAX_SANITIZE_CHARS;
  let out = truncated ? html.slice(0, MAX_SANITIZE_CHARS) : html;

  // Komplette Elemente inkl. Inhalt entfernen, dann uebrig gebliebene
  // einzelne Tags. Zwei Durchlaeufe insgesamt, unabhaengig von der Anzahl
  // der gesperrten Tags.
  out = out.replace(BLOCKED_ELEMENTS, "");
  out = out.replace(BLOCKED_SINGLE_TAGS, "");

  // Kommentare (koennen Conditional Comments mit Markup enthalten).
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Event-Handler-Attribute (onclick=..., onerror=...), mit und ohne Quotes.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // Gefaehrliche URL-Schemata in href/src/action.
  out = out.replace(
    /\s(href|src|action|formaction|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data):[^"'>\s]*("|')?/gi,
    ' $1="#"'
  );

  return truncated ? out.trim() + TRUNCATED_NOTE : out.trim();
}

/**
 * Schneidet zitierte Vorgaenger-Mails ab, damit im Ticket nur der neue Text
 * steht. Konservativ: nur eindeutige Trennmarken, lieber einmal zu wenig
 * kuerzen als Inhalt verlieren.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  // Gleiche Begruendung wie bei sanitizeIncomingHtml: fremder Inhalt ohne
  // Groessengrenze darf die Event-Loop nicht blockieren.
  const capped =
    text.length > MAX_SANITIZE_CHARS
      ? text.slice(0, MAX_SANITIZE_CHARS) + "\n\n[Nachricht gekürzt – vollständige Mail im Postfach.]"
      : text;
  const lines = capped.split(/\r?\n/);
  const markers: RegExp[] = [
    /^-{2,}\s*Urspr(ü|ue)ngliche Nachricht\s*-{2,}/i,
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^-{2,}\s*Weitergeleitete Nachricht\s*-{2,}/i,
    /^_{5,}$/,
    /^Von:\s.+/i,
    /^From:\s.+/i,
    /^Am .+ schrieb .+:$/i,
    /^On .+ wrote:$/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (markers.some((re) => re.test(line))) {
      // Nur kuerzen, wenn davor ueberhaupt Text steht.
      const head = lines.slice(0, i).join("\n").trim();
      if (head.length > 0) return head;
    }
  }

  // Reine Zitatbloecke (">") am Ende abschneiden.
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1].trim();
    if (line === "" || line.startsWith(">")) end--;
    else break;
  }
  return lines.slice(0, end).join("\n").trim() || capped.trim();
}

/** Plaintext aus dem Antwort-Editor in schlichtes HTML wandeln. */
export function plainToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.65;">${block.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
