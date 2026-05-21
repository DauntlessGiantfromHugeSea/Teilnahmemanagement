import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@fb-akademie.de";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

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
  console.log(`Admin angelegt: ${adminEmail} / ${adminPassword}`);
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
