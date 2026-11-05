#!/bin/sh
# Prueft, ob der Mailversand ueber Microsoft Graph tatsaechlich funktioniert.
#
#   bash scripts/check-mail-graph.sh                 # nur pruefen
#   bash scripts/check-mail-graph.sh test@firma.de   # zusaetzlich Testmail
#
# Laeuft im App-Container, damit genau die Werte geprueft werden, mit denen
# die Anwendung arbeitet - nicht die aus der .env, die abweichen koennten.
# Es werden keine Geheimnisse ausgegeben.
set -eu

EMPFAENGER="${1:-}"

docker compose exec -T -e PRUEF_EMPFAENGER="$EMPFAENGER" app node -e '
(async () => {
  const t = process.env.MS_TENANT_ID, c = process.env.MS_CLIENT_ID, s = process.env.MS_CLIENT_SECRET;
  const sender = process.env.MAIL_GRAPH_SENDER;
  const transport = process.env.MAIL_TRANSPORT || "auto";
  const an = process.env.PRUEF_EMPFAENGER;

  console.log("Versandweg laut Konfiguration:", transport);
  console.log("Absenderpostfach:            ", sender || "NICHT GESETZT");
  if (!t || !c || !s) { console.log("\nFEHLER: MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET unvollstaendig."); process.exit(1); }
  if (!sender)        { console.log("\nFEHLER: MAIL_GRAPH_SENDER ist nicht gesetzt."); process.exit(1); }

  // 1) Token holen und die erteilten Berechtigungen ablesen
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c, client_secret: s,
      grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const j = await r.json();
  if (!j.access_token) {
    console.log("\nFEHLER beim Token:", j.error, "-", (j.error_description || "").split("\n")[0]);
    process.exit(1);
  }
  const claims = JSON.parse(Buffer.from(j.access_token.split(".")[1], "base64url").toString());
  const rollen = claims.roles || [];
  console.log("App:                         ", claims.app_displayname || claims.appid);
  console.log("Erteilte Berechtigungen:     ", rollen.join(", ") || "KEINE");

  const fehlend = ["Mail.Send"].filter((p) => !rollen.includes(p));
  if (fehlend.length) {
    console.log("\nFEHLER: Es fehlt die Anwendungsberechtigung", fehlend.join(", "));
    console.log("Im Entra Admin Center hinzufuegen und Administratorzustimmung erteilen,");
    console.log("danach den App-Container neu starten (Token wird bis zu 1 h zwischengespeichert).");
    process.exit(1);
  }

  // 2) Erreichbarkeit des Absenderpostfachs
  const probe = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/mailFolders/inbox?$select=displayName`,
    { headers: { Authorization: "Bearer " + j.access_token } }
  );
  if (probe.ok) {
    console.log("Postfach erreichbar:          ja");
  } else {
    let d = probe.status + "";
    try { const e = await probe.json(); d = (e.error && (e.error.code + ": " + e.error.message)) || d; } catch {}
    console.log("Postfach erreichbar:          NEIN -", d);
    console.log("(Fuer den reinen Versand reicht Mail.Send; dieser Zugriff braucht Mail.ReadWrite.)");
  }

  // 3) Optional: Testmail
  if (!an) { console.log("\nAlles bereit. Fuer eine Testmail: bash scripts/check-mail-graph.sh deine@adresse.de"); return; }

  const send = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: "Bearer " + j.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: "Testmail aus dem Teilnahmemanagement",
        body: { contentType: "Text",
          content: "Diese Nachricht wurde ueber Microsoft Graph verschickt.\nAbsender: " + sender },
        toRecipients: [{ emailAddress: { address: an } }],
      },
      saveToSentItems: true,
    }),
  });
  if (send.ok) {
    console.log("\nTestmail an " + an + " verschickt. Sie liegt auch in \"Gesendete Elemente\" von " + sender + ".");
  } else {
    let d = send.status + "";
    try { const e = await send.json(); d = (e.error && (e.error.code + ": " + e.error.message)) || d; } catch {}
    console.log("\nFEHLER beim Versand:", d);
    process.exit(1);
  }
})();
'
