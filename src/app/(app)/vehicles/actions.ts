"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FuelType, VehicleCategory, UsageUnit } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertVehicleAccess, getUserGarageIds } from "@/lib/vehicles";

function optString(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}
function optInt(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}
function optFloat(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}

const FUEL_VALUES = new Set(Object.values(FuelType));
function fuel(value: FormDataEntryValue | null): FuelType {
  const v = String(value ?? "");
  return FUEL_VALUES.has(v as FuelType) ? (v as FuelType) : FuelType.GASOLINE;
}

const CATEGORY_VALUES = new Set(Object.values(VehicleCategory));
function category(value: FormDataEntryValue | null): VehicleCategory {
  const v = String(value ?? "");
  return CATEGORY_VALUES.has(v as VehicleCategory)
    ? (v as VehicleCategory)
    : VehicleCategory.CAR;
}
function usageUnit(value: FormDataEntryValue | null): UsageUnit {
  return String(value ?? "") === "HOURS" ? UsageUnit.HOURS : UsageUnit.KM;
}

const vehicleFields = (formData: FormData) => ({
  name: String(formData.get("name") ?? "").trim(),
  category: category(formData.get("category")),
  usageUnit: usageUnit(formData.get("usageUnit")),
  make: optString(formData.get("make")),
  model: optString(formData.get("model")),
  year: optInt(formData.get("year")),
  plate: optString(formData.get("plate")),
  vin: optString(formData.get("vin")),
  fuelType: fuel(formData.get("fuelType")),
  tankCapacity: optFloat(formData.get("tankCapacity")),
  initialMileage: optInt(formData.get("initialMileage")),
  notes: optString(formData.get("notes")),
});

export async function createVehicle(formData: FormData) {
  const user = await requireUser();
  const data = vehicleFields(formData);
  if (!data.name) return;

  // Rattache le véhicule au premier garage de l'utilisateur (en crée un si besoin).
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
    data: { ...data, garageId },
  });
  revalidatePath("/dashboard");
  redirect(`/vehicles/${vehicle.id}`);
}

export async function updateVehicle(vehicleId: string, formData: FormData) {
  const user = await requireUser();
  await assertVehicleAccess(user.id, vehicleId);
  const data = vehicleFields(formData);
  if (!data.name) return;

  await prisma.vehicle.update({ where: { id: vehicleId }, data });
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(`/vehicles/${vehicleId}`);
}

export async function deleteVehicle(vehicleId: string) {
  const user = await requireUser();
  await assertVehicleAccess(user.id, vehicleId);
  await prisma.vehicle.delete({ where: { id: vehicleId } });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
