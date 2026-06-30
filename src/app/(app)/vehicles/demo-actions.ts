"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { getUserGarageIds } from "@/lib/vehicles";

const d = (s: string) => new Date(s);

/**
 * Crée un véhicule de démonstration richement rempli (entretiens variés,
 * réparations, pleins, relevés, documents, rappels) dans le garage de
 * l'utilisateur. Pratique pour faire des essais ; supprimable comme tout
 * véhicule (zone de danger).
 */
export async function createDemoVehicle() {
  const user = await requireUser();
  await assertCanWrite();

  let garageId = (await getUserGarageIds(user.id))[0];
  if (!garageId) {
    const g = await prisma.garage.create({
      data: {
        name: `Garage de ${user.name}`,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    garageId = g.id;
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      garageId,
      name: "🧪 Démo — Peugeot 308",
      category: "CAR",
      usageUnit: "KM",
      make: "Peugeot",
      model: "308 II 1.5 BlueHDi",
      year: 2018,
      plate: "DM-308-AB",
      fuelType: "DIESEL",
      tankCapacity: 53,
      initialMileage: 18000,
      notes:
        "Véhicule de démonstration généré pour les essais. Supprimez-le quand vous voulez (Profil → Zone de danger).",
    },
  });

  await prisma.maintenance.createMany({
    data: [
      { vehicleId: vehicle.id, type: "VIDANGE", types: "VIDANGE,FILTRE_HUILE", title: "Vidange + filtre à huile", performedAt: d("2019-03-12"), mileage: 25000, cost: 119.9, serviceName: "Norauto", nextDueDate: d("2020-03-12"), nextDueMileage: 45000 },
      { vehicleId: vehicle.id, type: "FILTRE_HABITACLE", types: "FILTRE_HABITACLE", title: "Filtre habitacle", performedAt: d("2019-03-12"), mileage: 25000, cost: 25, serviceName: "Norauto" },
      { vehicleId: vehicle.id, type: "PNEUS", types: "PNEUS", title: "4 pneus été", performedAt: d("2019-09-04"), mileage: 32000, cost: 360, serviceName: "Euromaster" },
      { vehicleId: vehicle.id, type: "REVISION", types: "REVISION,VIDANGE,FILTRE_HUILE", title: "Révision constructeur", performedAt: d("2020-04-20"), mileage: 46000, cost: 210, serviceName: "Peugeot" },
      { vehicleId: vehicle.id, type: "FREINS", types: "FREINS", title: "Plaquettes avant", performedAt: d("2020-11-08"), mileage: 58000, cost: 180, serviceName: "Midas" },
      { vehicleId: vehicle.id, type: "VIDANGE", types: "VIDANGE,FILTRE_HUILE", title: "Vidange", performedAt: d("2021-04-15"), mileage: 66000, cost: 125, serviceName: "Norauto", nextDueDate: d("2022-04-15"), nextDueMileage: 86000 },
      { vehicleId: vehicle.id, type: "FILTRE_AIR", types: "FILTRE_AIR", title: "Filtre à air", performedAt: d("2021-04-15"), mileage: 66000, cost: 30, serviceName: "Norauto" },
      { vehicleId: vehicle.id, type: "BATTERIE", types: "BATTERIE", title: "Batterie 70 Ah", performedAt: d("2021-12-02"), mileage: 74000, cost: 130, serviceName: "Feu Vert" },
      { vehicleId: vehicle.id, type: "COURROIE_DISTRIBUTION", types: "COURROIE_DISTRIBUTION", title: "Kit distribution + pompe à eau", performedAt: d("2022-05-18"), mileage: 88000, cost: 690, serviceName: "Peugeot", nextDueDate: d("2028-05-18"), nextDueMileage: 208000 },
      { vehicleId: vehicle.id, type: "VIDANGE", types: "VIDANGE,FILTRE_HUILE", title: "Vidange", performedAt: d("2022-06-10"), mileage: 90000, cost: 129, serviceName: "Norauto" },
      { vehicleId: vehicle.id, type: "CLIMATISATION", types: "CLIMATISATION", title: "Recharge climatisation", performedAt: d("2022-07-22"), mileage: 92000, cost: 79, serviceName: "Midas" },
      { vehicleId: vehicle.id, type: "FILTRE_CARBURANT", types: "FILTRE_CARBURANT", title: "Filtre à carburant", performedAt: d("2023-03-09"), mileage: 102000, cost: 45, serviceName: "Garage du coin" },
      { vehicleId: vehicle.id, type: "FREINS", types: "FREINS", title: "Disques + plaquettes arrière", performedAt: d("2023-06-14"), mileage: 108000, cost: 320, serviceName: "Euromaster" },
      { vehicleId: vehicle.id, type: "ESSUIE_GLACE", types: "ESSUIE_GLACE", title: "Balais d'essuie-glace", performedAt: d("2023-10-01"), mileage: 114000, cost: 28, serviceName: "Norauto" },
      { vehicleId: vehicle.id, type: "VIDANGE", types: "VIDANGE,FILTRE_HUILE", title: "Vidange", performedAt: d("2024-05-05"), mileage: 122000, cost: 135, serviceName: "Norauto" },
      { vehicleId: vehicle.id, type: "AMORTISSEURS", types: "AMORTISSEURS", title: "2 amortisseurs avant", performedAt: d("2024-09-12"), mileage: 128000, cost: 480, serviceName: "Garage du coin" },
      { vehicleId: vehicle.id, type: "LIQUIDE_REFROIDISSEMENT", types: "LIQUIDE_REFROIDISSEMENT", title: "Remplacement liquide de refroidissement", performedAt: d("2025-03-20"), mileage: 134000, cost: 60, serviceName: "Peugeot" },
      { vehicleId: vehicle.id, type: "LIQUIDE_DE_FREIN", types: "LIQUIDE_DE_FREIN", title: "Purge du liquide de frein", performedAt: d("2025-11-10"), mileage: 140000, cost: 50, serviceName: "Peugeot" },
      { vehicleId: vehicle.id, type: "REVISION", types: "REVISION,VIDANGE,FILTRE_HUILE,FILTRE_HABITACLE", title: "Grande révision", performedAt: d("2025-11-10"), mileage: 140000, cost: 240, serviceName: "Peugeot", nextDueDate: d("2026-11-10"), nextDueMileage: 155000 },
    ],
  });

  await prisma.repair.createMany({
    data: [
      { vehicleId: vehicle.id, title: "Remplacement alternateur", performedAt: d("2021-08-03"), mileage: 70000, cost: 380, serviceName: "Garage du coin" },
      { vehicleId: vehicle.id, title: "Embrayage + volant moteur", performedAt: d("2023-12-11"), mileage: 116000, cost: 1150, serviceName: "Peugeot" },
      { vehicleId: vehicle.id, title: "Capteur ABS avant droit", performedAt: d("2024-12-04"), mileage: 130000, cost: 140, serviceName: "Garage du coin", underWarranty: false },
    ],
  });

  await prisma.fuelEntry.createMany({
    data: [
      { vehicleId: vehicle.id, filledAt: d("2025-12-01"), mileage: 138000, liters: 48, pricePerLiter: 1.82, totalCost: 87.36, fullTank: true, station: "TotalEnergies" },
      { vehicleId: vehicle.id, filledAt: d("2025-12-20"), mileage: 138750, liters: 41, pricePerLiter: 1.79, totalCost: 73.39, fullTank: true, station: "Intermarché" },
      { vehicleId: vehicle.id, filledAt: d("2026-01-10"), mileage: 139500, liters: 44, pricePerLiter: 1.85, totalCost: 81.4, fullTank: true, station: "Avia" },
      { vehicleId: vehicle.id, filledAt: d("2026-02-02"), mileage: 140200, liters: 39, pricePerLiter: 1.8, totalCost: 70.2, fullTank: true, station: "Leclerc" },
    ],
  });

  await prisma.mileageEntry.createMany({
    data: [
      { vehicleId: vehicle.id, readAt: d("2025-06-01"), mileage: 135000 },
      { vehicleId: vehicle.id, readAt: d("2026-01-01"), mileage: 139500, notes: "Relevé Nouvel An" },
    ],
  });

  await prisma.document.createMany({
    data: [
      { vehicleId: vehicle.id, type: "CONTROLE_TECHNIQUE", provider: "Dekra", issuedAt: d("2024-02-15"), expiresAt: d("2026-02-15"), cost: 89 },
      { vehicleId: vehicle.id, type: "ASSURANCE", label: "Tous risques", provider: "MAIF", expiresAt: d("2026-09-30"), cost: 640 },
      { vehicleId: vehicle.id, type: "CARTE_GRISE", provider: "Préfecture", issuedAt: d("2018-06-20") },
    ],
  });

  await prisma.reminder.createMany({
    data: [
      { vehicleId: vehicle.id, kind: "MAINTENANCE", label: "Prochaine vidange", dueDate: d("2026-05-05"), dueMileage: 152000 },
      { vehicleId: vehicle.id, kind: "CONTROLE_TECHNIQUE", label: "Contrôle technique", dueDate: d("2026-02-15") },
    ],
  });

  revalidatePath("/dashboard");
  redirect(`/vehicles/${vehicle.id}`);
}
