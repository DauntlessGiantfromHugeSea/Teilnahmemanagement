// Prueft Transportwahl und Graph-Nachrichtenbildung.
// Reine Funktionen, kein Netz, kein Versand:
//   npx tsx scripts/test-mailtransport.ts
import { buildGraphMessage, graphAllowedHeaders, GRAPH_SEND_LIMIT_BYTES } from "@/lib/msGraphMail";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : `\n       erwartet: ${want}\n       erhalten: ${got}`}`);
};

// --- Kopfzeilen: Graph nimmt nur x-* ---
const h = graphAllowedHeaders({
  "List-Unsubscribe": "<https://x/abmelden>",
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  "x-ticket-ref": "FBA-ABCDE-12345",
});
check("x-Header bleibt", h.allowed.map((a) => a.name).join(","), "x-ticket-ref");
check("Standard-Header verworfen", h.dropped.sort().join(","), "List-Unsubscribe,List-Unsubscribe-Post");

// --- Empfaenger ---
const m1 = buildGraphMessage({
  subject: "Test", html: "<p>Hallo</p>",
  to: ["a@x.de", " b@x.de "], cc: ["c@x.de"], bcc: ["d@x.de"], replyTo: "info@fb-akademie.de",
});
check("To-Empfaenger", m1.message.toRecipients.map((r) => r.emailAddress.address).join(","), "a@x.de,b@x.de");
check("Leerraum getrimmt", m1.message.toRecipients[1].emailAddress.address, "b@x.de");
check("Cc gesetzt", m1.message.ccRecipients?.[0].emailAddress.address, "c@x.de");
check("Bcc gesetzt", m1.message.bccRecipients?.[0].emailAddress.address, "d@x.de");
check("Reply-To gesetzt", m1.message.replyTo?.[0].emailAddress.address, "info@fb-akademie.de");
check("HTML-Typ", m1.message.body.contentType, "HTML");

// --- Nur Text ---
const m2 = buildGraphMessage({ subject: "S", text: "nur text", to: ["a@x.de"] });
check("Text-Typ ohne HTML", m2.message.body.contentType, "Text");
check("Textinhalt", m2.message.body.content, "nur text");
check("kein leeres Cc-Feld", m2.message.ccRecipients === undefined, true);

// --- Absender ---
const m3 = buildGraphMessage({
  subject: "S", text: "t", to: ["a@x.de"],
  fromName: "FB-Akademie", fromAddress: "info@fb-akademie.de",
});
check("Absendername", m3.message.from?.emailAddress.name, "FB-Akademie");
check("Absenderadresse", m3.message.from?.emailAddress.address, "info@fb-akademie.de");

// --- Anhaenge ---
const pdf = Buffer.from("%PDF-1.7 dummy inhalt");
const m4 = buildGraphMessage({
  subject: "Zertifikat", html: "<p>x</p>", to: ["a@x.de"],
  attachments: [{ filename: "Zertifikat.pdf", content: pdf, contentType: "application/pdf" }],
});
check("Anhang vorhanden", m4.message.attachments?.length, 1);
check("Anhang-Typ", m4.message.attachments?.[0]["@odata.type"], "#microsoft.graph.fileAttachment");
check("Anhang-Name", m4.message.attachments?.[0].name, "Zertifikat.pdf");
check("Anhang base64-kodiert",
  Buffer.from(m4.message.attachments![0].contentBytes, "base64").toString(), pdf.toString());

// --- Groessengrenze ---
const gross = buildGraphMessage({
  subject: "S", text: "t", to: ["a@x.de"],
  attachments: [{ filename: "gross.bin", content: Buffer.alloc(4_000_000) }],
});
check("grosser Anhang ueberschreitet die Grenze", gross.attachmentBytes > GRAPH_SEND_LIMIT_BYTES, true);
const klein = buildGraphMessage({
  subject: "S", text: "t", to: ["a@x.de"],
  attachments: [{ filename: "zert.pdf", content: Buffer.alloc(85_000) }],
});
check("typisches Zertifikat passt", klein.attachmentBytes < GRAPH_SEND_LIMIT_BYTES, true);

// --- Transportwahl ---
const frisch = async () => {
  delete require.cache[require.resolve("@/lib/mailer")];
  return (await import("@/lib/mailer?" + Math.random())).mailTransportKind;
};
const setEnv = (e: Record<string, string | undefined>) => {
  for (const k of ["MAIL_TRANSPORT","MAIL_GRAPH_SENDER","MAIL_FROM","MS_TENANT_ID","MS_CLIENT_ID",
                   "MS_CLIENT_SECRET","SMTP_HOST","SMTP_USER","SMTP_PASS","SMTP_FROM"]) delete process.env[k];
  for (const [k, v] of Object.entries(e)) if (v !== undefined) process.env[k] = v;
};

(async () => {
  const MS = { MS_TENANT_ID: "e47a6b12-0ae0-4db5-a6ee-ec4186b11bb0", MS_CLIENT_ID: "cid", MS_CLIENT_SECRET: "sec" };
  const SMTP = { SMTP_HOST: "smtp-relay.brevo.com", SMTP_USER: "u", SMTP_PASS: "p" };
  const FROM = { MAIL_FROM: "FB-Akademie <info@fb-akademie.de>" };

  setEnv({}); check("nichts konfiguriert -> none", (await frisch())(), "none");
  setEnv({ ...MS, ...FROM, MAIL_GRAPH_SENDER: "info@fb-akademie.de" });
  check("Graph konfiguriert -> graph", (await frisch())(), "graph");
  setEnv({ ...SMTP, ...FROM }); check("nur SMTP -> smtp", (await frisch())(), "smtp");
  setEnv({ ...MS, ...SMTP, ...FROM, MAIL_GRAPH_SENDER: "info@fb-akademie.de" });
  check("beide vorhanden -> graph gewinnt", (await frisch())(), "graph");
  setEnv({ ...MS, ...SMTP, ...FROM, MAIL_GRAPH_SENDER: "info@fb-akademie.de", MAIL_TRANSPORT: "smtp" });
  check("MAIL_TRANSPORT=smtp erzwingt smtp", (await frisch())(), "smtp");
  setEnv({ ...SMTP, ...FROM, MAIL_TRANSPORT: "graph" });
  check("graph erzwungen aber unkonfiguriert -> none", (await frisch())(), "none");
  setEnv({ ...MS, ...FROM }); check("Absender aus MAIL_FROM abgeleitet", (await frisch())(), "graph");
  setEnv({ ...MS, MAIL_GRAPH_SENDER: "info@fb-akademie.de", MS_TENANT_ID: "common" });
  check("tenant 'common' ist bei App-Only unbrauchbar", (await frisch())(), "none");

  console.log(fails === 0 ? "\nALLE TESTS OK" : `\n${fails} FEHLER`);
  process.exit(fails === 0 ? 0 : 1);
})();
