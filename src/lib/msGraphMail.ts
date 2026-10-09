import type { Mailbox } from "@prisma/client";
import { safeDecrypt } from "./crypto";

// Microsoft 365 / Exchange Online ueber die Graph-API (App-Only).
//
// Microsoft hat Basic Authentication fuer IMAP und SMTP in Exchange Online
// abgeschaltet - Benutzername + Passwort funktioniert dort nicht mehr. Statt
// dessen holt die App ein Token per Client-Credentials-Flow und spricht die
// Graph-API an.
//
// Noetig ist eine App-Registrierung im Entra Admin Center mit den
// APPLICATION-Berechtigungen (nicht delegiert!) "Mail.ReadWrite" und
// "Mail.Send" samt Administrator-Zustimmung. Per Application Access Policy
// laesst sich der Zugriff auf genau die gewuenschten Postfaecher begrenzen -
// siehe POSTEINGANG.md.
//
// Zugangsdaten kommen pro Postfach aus der DB; sind sie dort leer, greifen
// MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET aus der .env (dieselbe
// Registrierung wie der Entra-SSO).

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function graphCredentials(mb: Mailbox): GraphCredentials | null {
  const tenantId = mb.graphTenantId || process.env.MS_TENANT_ID || "";
  const clientId = mb.graphClientId || process.env.MS_CLIENT_ID || "";
  const clientSecret = safeDecrypt(mb.graphClientSecret) || process.env.MS_CLIENT_SECRET || "";
  if (!tenantId || !clientId || !clientSecret) return null;
  // "common" funktioniert bei App-Only nicht - dort braucht es den Tenant.
  if (tenantId === "common" || tenantId === "organizations") return null;
  return { tenantId, clientId, clientSecret };
}

// Token-Cache je Credential-Satz. Graph-Tokens laufen nach ca. 1h ab; wir
// erneuern 2 Minuten vor Ablauf.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function graphToken(creds: GraphCredentials): Promise<string> {
  const key = `${creds.tenantId}|${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Microsoft-Token fehlgeschlagen: ${json.error_description ?? res.status}`);
  }
  const expiresAt = Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000;
  tokenCache.set(key, { token: json.access_token, expiresAt });
  return json.access_token;
}

async function graphFetch(
  creds: GraphCredentials,
  path: string,
  init?: RequestInit & { raw?: boolean }
): Promise<Response> {
  const token = await graphToken(creds);
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const err = (await res.json()) as { error?: { code?: string; message?: string } };
      if (err.error) detail = `${err.error.code ?? res.status}: ${err.error.message ?? ""}`;
    } catch {
      /* Antwort war kein JSON */
    }
    throw new Error(`Graph ${path}: ${detail}`);
  }
  return res;
}

export interface GraphMessageHead {
  id: string;
  receivedDateTime: string;
  internetMessageId: string | null;
}

/**
 * Listet Nachrichten, die nach `since` eingegangen sind, aelteste zuerst.
 * Ohne `since` werden nur die neuesten `limit` Nachrichten geliefert.
 */
export async function graphListMessages(
  mb: Mailbox,
  creds: GraphCredentials,
  since: Date | null,
  limit: number
): Promise<GraphMessageHead[]> {
  const folder = mb.graphFolder || "inbox";
  const params = new URLSearchParams({
    $select: "id,receivedDateTime,internetMessageId",
    $orderby: since ? "receivedDateTime asc" : "receivedDateTime desc",
    $top: String(limit),
  });
  if (since) params.set("$filter", `receivedDateTime gt ${since.toISOString()}`);

  const path = `/users/${encodeURIComponent(mb.address)}/mailFolders/${encodeURIComponent(
    folder
  )}/messages?${params.toString()}`;
  const res = await graphFetch(creds, path);
  const json = (await res.json()) as { value?: GraphMessageHead[] };
  const list = json.value ?? [];
  // Ohne since kam die Liste absteigend - fuer die Verarbeitung umdrehen.
  return since ? list : list.reverse();
}

/** Laedt eine Nachricht als MIME-Rohdaten (RFC 822). */
export async function graphFetchMime(
  mb: Mailbox,
  creds: GraphCredentials,
  messageId: string
): Promise<Buffer> {
  const path = `/users/${encodeURIComponent(mb.address)}/messages/${encodeURIComponent(
    messageId
  )}/$value`;
  const res = await graphFetch(creds, path);
  return Buffer.from(await res.arrayBuffer());
}

/** Zeitpunkt der neuesten Nachricht im Ordner - Startmarke fuer neue Postfaecher. */
export async function graphLatestReceivedAt(
  mb: Mailbox,
  creds: GraphCredentials
): Promise<Date | null> {
  const list = await graphListMessages(mb, creds, null, 1);
  const newest = list[list.length - 1];
  return newest ? new Date(newest.receivedDateTime) : null;
}

export interface GraphSendInput {
  mailbox: Mailbox;
  creds: GraphCredentials;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  ticketReference: string;
  /** Graph-ID der Nachricht, auf die geantwortet wird - sorgt fuer sauberes Threading. */
  replyToGraphId?: string | null;
}

function recipients(list: string[]) {
  return list.map((address) => ({ emailAddress: { address } }));
}

/**
 * Verschickt eine Antwort. Ist die Graph-ID der eingehenden Nachricht bekannt,
 * laeuft der Versand ueber createReply - dann setzt Exchange In-Reply-To und
 * References selbst und die Mail haengt beim Kunden im richtigen Thread.
 * Sonst wird sendMail als Fallback genutzt.
 */
export async function graphSendReply(input: GraphSendInput): Promise<{ messageId?: string }> {
  const user = encodeURIComponent(input.mailbox.address);
  const headers = [{ name: "x-ticket-ref", value: input.ticketReference }];

  if (input.replyToGraphId) {
    try {
      // 1) Entwurf als Antwort erzeugen (uebernimmt Thread-Header)
      const draftRes = await graphFetch(
        input.creds,
        `/users/${user}/messages/${encodeURIComponent(input.replyToGraphId)}/createReply`,
        { method: "POST", body: "{}" }
      );
      const draft = (await draftRes.json()) as { id: string };

      // 2) Inhalt, Betreff und Empfaenger ersetzen (createReply zitiert sonst)
      await graphFetch(input.creds, `/users/${user}/messages/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          subject: input.subject,
          body: { contentType: "HTML", content: input.html },
          toRecipients: recipients(input.to),
          ccRecipients: recipients(input.cc ?? []),
          internetMessageHeaders: headers,
        }),
      });

      // 3) Abschicken
      await graphFetch(input.creds, `/users/${user}/messages/${encodeURIComponent(draft.id)}/send`, {
        method: "POST",
      });

      // internetMessageId steht erst nach dem Senden fest und der Entwurf ist
      // dann verschoben - fuer die Zuordnung reicht uns die Referenz im Text.
      return {};
    } catch (e) {
      console.warn(
        `[graph] createReply fehlgeschlagen, weiche auf sendMail aus: ${(e as Error).message}`
      );
    }
  }

  await graphFetch(input.creds, `/users/${user}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.html },
        toRecipients: recipients(input.to),
        ccRecipients: recipients(input.cc ?? []),
        internetMessageHeaders: headers,
      },
      saveToSentItems: true,
    }),
  });
  return {};
}

/** Prueft Token und Postfachzugriff. Gibt die Anzahl Nachrichten im Ordner zurueck. */
export async function graphTestConnection(
  mb: Mailbox,
  creds: GraphCredentials
): Promise<{ displayName: string; total: number }> {
  const user = encodeURIComponent(mb.address);
  const folder = encodeURIComponent(mb.graphFolder || "inbox");
  const res = await graphFetch(
    creds,
    `/users/${user}/mailFolders/${folder}?$select=displayName,totalItemCount`
  );
  const json = (await res.json()) as { displayName?: string; totalItemCount?: number };
  return { displayName: json.displayName ?? "Posteingang", total: json.totalItemCount ?? 0 };
}
