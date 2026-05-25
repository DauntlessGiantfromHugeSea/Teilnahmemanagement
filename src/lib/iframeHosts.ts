// Iframe-Embedding: erlaubte Eltern-Hosts.
//
// Quelle ist die Environment-Variable IFRAME_HOSTS. Format: durch Whitespace
// oder Komma getrennte Domains, jeweils ohne Schema und ohne Pfad, z. B.:
//
//   IFRAME_HOSTS="fb-eng.de fb-stage.de fi-fb.de"
//
// Subdomains werden automatisch mitgenehmigt (z. B. www.fb-eng.de,
// app.fb-eng.de) - dafuer erzeugen wir pro Host einen Wildcard-Eintrag
// in der CSP frame-ancestors-Direktive.

const DEFAULT_HOSTS = ["fb-eng.de", "fb-stage.de", "fi-fb.de"];

export function parseIframeHosts(raw?: string | null): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_HOSTS];
  const items = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
    .filter((s) => /^[a-zA-Z0-9.-]+$/.test(s));
  // Duplikate raus
  return Array.from(new Set(items));
}

export function getIframeHosts(): string[] {
  return parseIframeHosts(process.env.IFRAME_HOSTS);
}

// Erzeugt die frame-ancestors-Direktive fuer den CSP-Header.
// Beispiel-Output:
//   'self' https://fb-eng.de https://*.fb-eng.de https://fb-stage.de https://*.fb-stage.de
export function buildFrameAncestors(hosts: string[]): string {
  const sources = ["'self'"];
  for (const h of hosts) {
    sources.push(`https://${h}`);
    sources.push(`https://*.${h}`);
  }
  return sources.join(" ");
}
