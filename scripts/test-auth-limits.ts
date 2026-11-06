// Prueft die datenbankgestuetzten Korrekturen aus dem Sicherheits-Audit:
// Versuchsbegrenzung beim zweiten Faktor, Zaehler und Anforderungsbremse
// beim Zertifikatsportal-OTP, Widerruf von Sitzungen ueber sessionEpoch.
//
// NIEMALS gegen die Produktionsdatenbank laufen lassen - das Skript schreibt.
// Es weigert sich, wenn der Datenbankname nicht "test" enthaelt.
//
//   createdb tm_test
//   DATABASE_URL="postgresql://.../tm_test" npx prisma db push
//   DATABASE_URL="postgresql://.../tm_test" \
//   FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
//     npx tsx scripts/test-auth-limits.ts

import { PrismaClient } from "@prisma/client";
import {
  MAX_2FA_ATTEMPTS,
  checkTwoFaGate,
  clearTwoFaFailures,
  lockedMessage,
  registerTwoFaFailure,
} from "@/lib/twoFactorLimit";
import {
  MAX_OTP_ATTEMPTS,
  MAX_OTP_REQUESTS,
  OtpRateLimited,
  createOtp,
  emailHashOf,
  verifyOtp,
} from "@/lib/certPortal";

const url = process.env.DATABASE_URL ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";
if (!/test/i.test(dbName)) {
  console.error(
    `Abbruch: DATABASE_URL zeigt auf "${dbName}". Dieses Skript schreibt und\n` +
      "laeuft nur gegen eine Datenbank, deren Name \"test\" enthaelt."
  );
  process.exit(2);
}

const prisma = new PrismaClient();
let fails = 0;
const check = (n: string, c: boolean, x?: unknown) => {
  if (!c) {
    fails++;
    console.log("FAIL", n, x ?? "");
  } else console.log("ok  ", n);
};

async function main() {
  // ---------------------------------------------------- Aufraeumen
  await prisma.certificateOtp.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: "@pruefung.test" } } });

  const user = await prisma.user.create({
    data: {
      email: "zweifaktor@pruefung.test",
      name: "Prueferin",
      passwordHash: "x",
      role: "VIEWER",
    },
  });

  // ------------------------------------- Versuchsbegrenzung zweiter Faktor
  check("frisches Konto nicht gesperrt", (await checkTwoFaGate(user.id)).locked === false);

  for (let i = 1; i < MAX_2FA_ATTEMPTS; i++) {
    const r = await registerTwoFaFailure(user.id);
    check(`Fehlversuch ${i} sperrt noch nicht`, r.locked === false, r);
  }
  const last = await registerTwoFaFailure(user.id);
  check(`Fehlversuch ${MAX_2FA_ATTEMPTS} sperrt`, last.locked === true, last);
  check("Sperre hat ein Ende", last.until instanceof Date && last.until.getTime() > Date.now());
  check("Sperre wird beim Pruefen gesehen", (await checkTwoFaGate(user.id)).locked === true);
  check("Hinweistext nennt Minuten", /\d+ Minuten/.test(lockedMessage(last.until)), lockedMessage(last.until));

  // Zaehler steht nach dem Sperren wieder auf 0, damit nach Ablauf wieder
  // die volle Anzahl Versuche zur Verfuegung steht.
  const afterLock = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { twoFaFailedCount: true },
  });
  check("Zaehler nach Sperre zurueckgesetzt", afterLock.twoFaFailedCount === 0, afterLock);

  // Abgelaufene Sperre: der naechste Fehlversuch sperrt nicht sofort wieder.
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFaLockedUntil: new Date(Date.now() - 60_000) },
  });
  check("abgelaufene Sperre gilt nicht mehr", (await checkTwoFaGate(user.id)).locked === false);
  const afterExpiry = await registerTwoFaFailure(user.id);
  check("nach Ablauf wieder volle Versuche", afterExpiry.locked === false, afterExpiry);

  await clearTwoFaFailures(user.id);
  const cleared = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { twoFaFailedCount: true, twoFaLockedUntil: true },
  });
  check(
    "erfolgreicher Faktor raeumt auf",
    cleared.twoFaFailedCount === 0 && cleared.twoFaLockedUntil === null,
    cleared
  );

  // Parallele Fehlversuche duerfen die Obergrenze nicht aushebeln.
  await clearTwoFaFailures(user.id);
  await Promise.all(Array.from({ length: 12 }, () => registerTwoFaFailure(user.id)));
  check("parallele Fehlversuche fuehren zur Sperre", (await checkTwoFaGate(user.id)).locked === true);

  // ------------------------------------------------- Sitzungswiderruf
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { sessionEpoch: true },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN", sessionEpoch: { increment: 1 } },
  });
  const after = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { sessionEpoch: true, role: true },
  });
  check("Rollenwechsel zaehlt sessionEpoch hoch", after.sessionEpoch === before.sessionEpoch + 1, after);
  check("neue Rolle steht in der Datenbank", after.role === "ADMIN");

  // --------------------------------------------- Zertifikatsportal-OTP
  const mail = "kundin@pruefung.test";
  const hash = emailHashOf(mail);

  const { code } = await createOtp(mail);
  check("Code ist sechsstellig", /^\d{6}$/.test(code), code);

  // Falsche Codes: nach MAX_OTP_ATTEMPTS ist Schluss, auch mit dem richtigen.
  for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
    const ok = await verifyOtp(mail, "000000" === code ? "111111" : "000000");
    check(`falscher Code ${i + 1} abgelehnt`, ok === false);
  }
  check("richtiger Code nach Limit abgelehnt", (await verifyOtp(mail, code)) === false);

  // Neuer Code funktioniert wieder und ist genau einmal gueltig.
  await prisma.certificateOtp.deleteMany({ where: { emailHash: hash } });
  const zweiter = await createOtp(mail);
  check("neuer Code wird angenommen", (await verifyOtp(mail, zweiter.code)) === true);
  check("derselbe Code nicht zweimal", (await verifyOtp(mail, zweiter.code)) === false);

  // Parallele Eingaben desselben richtigen Codes: genau eine darf gewinnen.
  await prisma.certificateOtp.deleteMany({ where: { emailHash: hash } });
  const dritter = await createOtp(mail);
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => verifyOtp(mail, dritter.code))
  );
  check(
    "parallele Eingaben: genau eine erfolgreich",
    parallel.filter(Boolean).length === 1,
    parallel
  );

  // Anforderungsbremse.
  await prisma.certificateOtp.deleteMany({ where: { emailHash: hash } });
  for (let i = 0; i < MAX_OTP_REQUESTS; i++) await createOtp(mail);
  let bremste = false;
  try {
    await createOtp(mail);
  } catch (e) {
    bremste = e instanceof OtpRateLimited;
  }
  check(`nach ${MAX_OTP_REQUESTS} Anforderungen gebremst`, bremste);

  // Die Bremse darf sich nicht dadurch zuruecksetzen, dass aeltere Codes
  // beim Anlegen entfernt werden - genau das war der Fehler zuvor.
  const zeilen = await prisma.certificateOtp.count({ where: { emailHash: hash } });
  check("alte Codes bleiben als Nachweis stehen", zeilen >= MAX_OTP_REQUESTS, zeilen);

  // Nur der neueste Code ist offen, die aelteren sind entwertet.
  const offen = await prisma.certificateOtp.count({ where: { emailHash: hash, consumed: false } });
  check("nur ein offener Code je Adresse", offen === 1, offen);

  // ---------------------------------------------------- Aufraeumen
  await prisma.certificateOtp.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: "@pruefung.test" } } });
}

main()
  .catch((e) => {
    console.error(e);
    fails++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(fails === 0 ? "\nAlle Pruefungen bestanden." : `\n${fails} Pruefung(en) fehlgeschlagen.`);
    process.exit(fails === 0 ? 0 : 1);
  });
