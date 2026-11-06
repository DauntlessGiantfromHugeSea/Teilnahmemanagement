// Misst, wie lange die schweren Listenseiten bei wachsendem Datenbestand
// brauchen. Zum Mitverfolgen, wenn mehr Teilnehmer dazukommen.
//
// NIEMALS gegen die Produktionsdatenbank laufen lassen - das Skript legt
// Testdaten an. Es bricht ab, wenn der Datenbankname nicht "test" enthaelt.
//
//   createdb tm_test
//   DATABASE_URL="postgresql://.../tm_test" npx prisma db push
//   DATABASE_URL="postgresql://.../tm_test" FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
//     npx tsx scripts/test-perf-listen.ts 20000
import { PrismaClient } from "@prisma/client";
import { encryptField, blindIndex } from "@/lib/crypto";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents } from "@/lib/pricing";

const url = process.env.DATABASE_URL ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";
if (!/test/i.test(dbName)) {
  console.error(`Abbruch: Datenbank "${dbName}" sieht nicht nach einer Testdatenbank aus.`);
  console.error('Der Name muss "test" enthalten. Das Skript schreibt Daten.');
  process.exit(2);
}

const prisma = new PrismaClient();
const ZIEL = Number(process.argv[2] ?? 20000);
const PAGE_SIZE = 50;

async function befuelle(n: number) {
  const da = await prisma.participant.count();
  if (da >= n) return;
  const u = await prisma.user.upsert({
    where: { email: "perf@test.local" }, update: {},
    create: { email: "perf@test.local", name: "Perf", passwordHash: "x", role: "ADMIN" },
  });
  const tr = await prisma.training.create({
    data: { title: "Lasttest", priceDay1: 49000, priceDay2: 49000, priceBoth: 89000 },
  });
  const evs = await Promise.all([0, 1, 2, 3, 4].map((i) =>
    prisma.event.create({
      data: { trainingId: tr.id, title: `Lasttest ${i}`, createdById: u.id, day1Date: new Date(2026, i, 10) },
    })));
  process.stdout.write(`Erzeuge ${n - da} Teilnehmer `);
  for (let off = da; off < n; off += 2000) {
    await prisma.participant.createMany({
      data: Array.from({ length: Math.min(2000, n - off) }, (_, k) => {
        const i = off + k;
        const mail = `person${i}@beispiel.invalid`;
        return {
          eventId: evs[i % evs.length].id,
          firstName: encryptField(`Vorname${i}`)!, lastName: encryptField(`Nachname${i}`)!,
          email: encryptField(mail)!, emailHash: blindIndex(mail),
          phone: encryptField("0341 1234567"), company: encryptField("Beispiel GmbH"),
          street: encryptField("Musterweg 1"), zip: encryptField("04179"),
          city: encryptField("Leipzig"), country: encryptField("DE"),
          notes: encryptField("Notiz"), invoiceNotes: encryptField("RE-Notiz"),
          billingCompany: encryptField("Beispiel GmbH"), billingName: encryptField(`Vorname${i} Nachname${i}`),
          billingStreet: encryptField("Musterweg 1"), billingZipCity: encryptField("04179 Leipzig"),
          billingEmail: encryptField(mail), costCenter: encryptField("KST-1"),
          invoiceStatus: i % 3 === 0 ? "OPEN" : "PAID",
        };
      }),
    });
    process.stdout.write(".");
  }
  console.log(" fertig");
}

(async () => {
  await befuelle(ZIEL);
  const gesamt = await prisma.participant.count();
  console.log(`\nDatenbestand: ${gesamt} Teilnehmer\n`);

  const where = { status: { not: "CANCELLED" as const } };
  const include = { event: { include: { training: true } } };
  const orderBy = [{ event: { day1Date: "desc" as const } }, { createdAt: "desc" as const }];

  // So arbeitet die Buchhaltungsseite heute: Zahlen aus der Datenbank,
  // entschluesselt wird nur die angezeigte Seite.
  const t0 = process.hrtime.bigint();
  const [total, offen, seite] = await Promise.all([
    prisma.participant.count({ where }),
    prisma.participant.count({ where: { ...where, invoiceStatus: "OPEN" } }),
    prisma.participant.findMany({ where, include, orderBy, skip: 0, take: PAGE_SIZE }),
  ]);
  seite.forEach((p) => {
    decryptParticipant(p);
    finalPriceCents(basePriceCents(p.event.training, p.dayOption), p.discountBps);
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log(`Buchhaltung, erste Seite:  ${ms.toFixed(0)} ms  (${total} gesamt, ${offen} offen)`);
  console.log(ms < 300
    ? "-> in Ordnung."
    : "-> zu langsam. Pruefen, ob eine Abfrage ohne take/skip dazugekommen ist.");

  await prisma.$disconnect();
})();
