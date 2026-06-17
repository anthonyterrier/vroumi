import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@carnet-auto.app";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  // Compte de démonstration (admin) + garage.
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Démo",
      passwordHash,
      isAdmin: true,
      memberships: {
        create: { role: "OWNER", garage: { create: { name: "Garage de démo" } } },
      },
    },
    include: { memberships: true },
  });

  const garageId = user.memberships[0].garageId;

  // Évite de dupliquer si le seed est relancé.
  const existing = await prisma.vehicle.findFirst({ where: { garageId } });
  if (existing) {
    console.log("Seed déjà appliqué. Identifiants : demo@carnet-auto.app / demo1234");
    return;
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      garageId,
      name: "La Clio",
      make: "Renault",
      model: "Clio IV",
      year: 2018,
      plate: "AA-123-BB",
      fuelType: "DIESEL",
      tankCapacity: 45,
      initialMileage: 95000,
      notes: "Voiture du quotidien.",
    },
  });

  await prisma.maintenance.createMany({
    data: [
      {
        vehicleId: vehicle.id,
        type: "VIDANGE",
        title: "Vidange + filtre à huile",
        performedAt: new Date("2024-03-12"),
        mileage: 110000,
        cost: 119.9,
        serviceName: "Norauto",
        nextDueDate: new Date("2025-03-12"),
        nextDueMileage: 125000,
      },
      {
        vehicleId: vehicle.id,
        type: "PNEUS",
        title: "4 pneus été",
        performedAt: new Date("2023-10-02"),
        mileage: 102000,
        cost: 420,
        serviceName: "Euromaster",
      },
    ],
  });

  await prisma.repair.create({
    data: {
      vehicleId: vehicle.id,
      title: "Remplacement batterie",
      performedAt: new Date("2024-01-08"),
      mileage: 108500,
      cost: 145,
      serviceName: "Garage du coin",
    },
  });

  await prisma.fuelEntry.createMany({
    data: [
      { vehicleId: vehicle.id, filledAt: new Date("2024-05-01"), mileage: 114000, liters: 42, pricePerLiter: 1.79, totalCost: 75.18, fullTank: true, station: "TotalEnergies" },
      { vehicleId: vehicle.id, filledAt: new Date("2024-05-20"), mileage: 114650, liters: 38, pricePerLiter: 1.82, totalCost: 69.16, fullTank: true, station: "Intermarché" },
    ],
  });

  await prisma.document.createMany({
    data: [
      {
        vehicleId: vehicle.id,
        type: "CONTROLE_TECHNIQUE",
        provider: "Dekra",
        issuedAt: new Date("2024-02-15"),
        expiresAt: new Date("2026-02-15"),
        cost: 89,
      },
      {
        vehicleId: vehicle.id,
        type: "ASSURANCE",
        label: "Tous risques",
        provider: "MAIF",
        expiresAt: new Date("2025-12-31"),
        cost: 620,
      },
    ],
  });

  await prisma.reminder.create({
    data: {
      vehicleId: vehicle.id,
      kind: "MAINTENANCE",
      label: "Prochaine vidange",
      dueDate: new Date("2025-03-12"),
      dueMileage: 125000,
    },
  });

  console.log("Seed terminé. Identifiants : demo@carnet-auto.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
