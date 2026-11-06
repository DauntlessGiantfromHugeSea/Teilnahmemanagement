// Verwendungszweck der signierten Tokens.
//
// Sitzung, 2FA-Zwischenstand und Teilnehmerportal teilen sich dasselbe
// Signaturgeheimnis (SESSION_SECRET). Ohne eine Bindung an den Zweck ginge
// ein Token der einen Art als Token der anderen durch - ein
// 2FA-Zwischenstand liesse sich als vollwertige Sitzung verwenden. Die
// Werte landen als "aud"-Anspruch im Token und werden beim Pruefen
// verlangt.
//
// Diese Datei hat bewusst keine Abhaengigkeiten: Die Middleware laeuft in
// der Edge-Runtime und kann nichts importieren, was Prisma nachzieht.

export const AUD_SESSION = "tm:session";
export const AUD_PENDING = "tm:2fa-pending";
export const AUD_CERT_PORTAL = "tm:cert-portal";
