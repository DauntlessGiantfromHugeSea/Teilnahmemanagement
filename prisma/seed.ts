import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@fb-akademie.de";
  // Kein Standardpasswort. Ein eingechecktes Passwort waere oeffentlich
  // bekannt und das erste Konto damit uebernehmbar, bevor der erste
  // Zweitfaktor existiert. Ohne gesetzte Variable wird nicht geseedet.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (adminPassword.length < 12) {
    console.error(
      "SEED_ADMIN_PASSWORD fehlt oder ist kuerzer als 12 Zeichen.\n" +
        "Kein Admin angelegt. Passwort erzeugen und setzen, z.B.:\n" +
        "  SEED_ADMIN_PASSWORD=\"$(openssl rand -base64 24)\" npm run db:seed"
    );
    process.exitCode = 1;
    return;
  }

  const exists = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (exists) {
    console.log(`Admin ${adminEmail} existiert bereits.`);
    return;
  }
  const hash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Administrator",
      passwordHash: hash,
      role: Role.ADMIN,
    },
  });
  console.log(`Admin angelegt: ${adminEmail}`);
  console.log("Beim ersten Login wird die 2FA-Einrichtung erzwungen.");

  await prisma.training.create({
    data: {
      title: "Beispiel-Schulung",
      description: "Zweitages-Schulung mit drei Buchungsoptionen.",
      priceDay1: 49000,
      priceDay2: 49000,
      priceBoth: 89000,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
