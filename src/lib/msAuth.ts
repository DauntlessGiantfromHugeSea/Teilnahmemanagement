// Microsoft / Entra ID Single-Sign-On (OIDC).
//
// Konfiguriert per env:
//   MS_TENANT_ID     z.B. "common" oder konkrete Tenant-GUID (whitelist)
//   MS_CLIENT_ID     Application (client) ID aus dem Entra Admin Center
//   MS_CLIENT_SECRET Client Secret
//   APP_URL          oeffentliche Basis-URL (fuer Redirect-URI)
//
// Verifiziert das ID-Token signaturseitig (RS256 ueber MS-JWKS) und prueft tid.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

function ensureEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} fehlt`);
  return v;
}

export function msConfigured(): boolean {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

function tenantId(): string {
  return ensureEnv("MS_TENANT_ID");
}
function clientId(): string {
  return ensureEnv("MS_CLIENT_ID");
}
function clientSecret(): string {
  return ensureEnv("MS_CLIENT_SECRET");
}
function redirectUri(): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/auth/microsoft/callback`;
}

const STATE_COOKIE = "ms_oauth_state";

function stateSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? "";
  if (!s) throw new Error("SESSION_SECRET fehlt");
  return new TextEncoder().encode(s);
}

export async function startMsLogin(returnTo?: string): Promise<string> {
  const t = tenantId();
  const state = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  // State + PKCE verifier als signierter Cookie ablegen (5 Minuten)
  const token = await new SignJWT({ state, codeVerifier, returnTo: returnTo ?? "/" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(stateSecret());
  cookies().set(STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface StatePayload {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

async function readState(): Promise<StatePayload | null> {
  const c = cookies().get(STATE_COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, stateSecret());
    return {
      state: String(payload.state),
      codeVerifier: String(payload.codeVerifier),
      returnTo: String(payload.returnTo ?? "/"),
    };
  } catch {
    return null;
  } finally {
    cookies().delete(STATE_COOKIE);
  }
}

export interface MsClaims {
  oid: string;       // stabile User-ID
  tid: string;       // Tenant
  email: string;
  name?: string;
  preferred_username?: string;
}

export async function handleMsCallback(code: string, state: string): Promise<{ claims: MsClaims; returnTo: string }> {
  const expected = await readState();
  if (!expected) throw new Error("Sitzung abgelaufen - bitte erneut anmelden.");
  if (expected.state !== state) throw new Error("Ungueltiger State - mögliche CSRF-Attacke.");

  const t = tenantId();
  // Token-Austausch
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: expected.codeVerifier,
    scope: "openid email profile",
  });
  const res = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token-Tausch fehlgeschlagen: ${text}`);
  }
  const json = await res.json() as { id_token?: string };
  if (!json.id_token) throw new Error("Keine id_token-Antwort von Microsoft.");

  // ID-Token signaturseitig pruefen
  const JWKS = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${t}/discovery/v2.0/keys`));
  const { payload } = await jwtVerify(json.id_token, JWKS, {
    audience: clientId(),
    issuer: [
      `https://login.microsoftonline.com/${t}/v2.0`,
      `https://sts.windows.net/${t}/`,
    ],
  });
  const tid = String(payload.tid ?? "");
  if (!tid || (t !== "common" && tid !== t)) {
    throw new Error("Anmeldung nur fuer den eigenen Tenant erlaubt.");
  }
  const oid = String(payload.oid ?? "");
  const email = String(payload.email ?? payload.preferred_username ?? "").toLowerCase();
  if (!oid || !email) {
    throw new Error("ID-Token enthaelt keine eindeutige Kennung / E-Mail.");
  }
  return {
    claims: {
      oid,
      tid,
      email,
      name: typeof payload.name === "string" ? payload.name : undefined,
      preferred_username: typeof payload.preferred_username === "string" ? payload.preferred_username : undefined,
    },
    returnTo: expected.returnTo || "/",
  };
}
