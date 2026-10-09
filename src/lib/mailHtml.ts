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

export function sanitizeIncomingHtml(html: string): string {
  let out = html;

  // Komplette Elemente inkl. Inhalt entfernen.
  for (const tag of BLOCKED_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // Selbstschliessende / nicht geschlossene Varianten.
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

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

  return out.trim();
}

/**
 * Schneidet zitierte Vorgaenger-Mails ab, damit im Ticket nur der neue Text
 * steht. Konservativ: nur eindeutige Trennmarken, lieber einmal zu wenig
 * kuerzen als Inhalt verlieren.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
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
  return lines.slice(0, end).join("\n").trim() || text.trim();
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
