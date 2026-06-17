"use server";

import { revalidatePath } from "next/cache";
import {
  MaintenanceType,
  DocumentType,
  ReminderKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertVehicleAccess, getUserGarageIds } from "@/lib/vehicles";
import { STARTER_SERVICES } from "@/lib/service-catalog";

// --- Helpers de parsing ---

function reqDate(value: FormDataEntryValue | null): Date {
  const d = value ? new Date(String(value)) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}
function optDate(value: FormDataEntryValue | null): Date | null {
  if (!value || String(value).trim() === "") return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}
function optStr(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}
function reqFloat(value: FormDataEntryValue | null): number {
  return parseFloat(String(value ?? "")) || 0;
}
function optFloat(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}
function optInt(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}
function bool(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

function enumVal<T extends Record<string, string>>(
  e: T,
  value: FormDataEntryValue | null,
  fallback: T[keyof T]
): T[keyof T] {
  const v = String(value ?? "");
  return (Object.values(e) as string[]).includes(v)
    ? (v as T[keyof T])
    : fallback;
}

async function guard(vehicleId: string) {
  const user = await requireUser();
  return assertVehicleAccess(user.id, vehicleId);
}
function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}`, "layout");
}

// Mémorise un nom de garage / prestataire dans le catalogue (proposé ensuite).
async function rememberService(garageId: string, name: string | null) {
  if (!name) return;
  await prisma.serviceContact.upsert({
    where: { garageId_name: { garageId, name } },
    create: { garageId, name },
    update: {},
  });
}

// --- Entretiens ---

const MAINT_TYPE_VALUES = new Set(Object.values(MaintenanceType));
/**
 * Lit la multi-sélection de types (cases à cocher `types`). Renvoie le type
 * principal (1er coché, pour compatibilité) et la liste CSV de tous les types.
 */
function maintenanceTypes(formData: FormData): {
  type: MaintenanceType;
  types: string;
} {
  const selected = formData
    .getAll("types")
    .map((v) => String(v))
    .filter((v) => MAINT_TYPE_VALUES.has(v as MaintenanceType));
  if (selected.length === 0) selected.push(MaintenanceType.REVISION);
  return { type: selected[0] as MaintenanceType, types: selected.join(",") };
}

export async function addMaintenance(vehicleId: string, formData: FormData) {
  const vehicle = await guard(vehicleId);
  const serviceName = optStr(formData.get("serviceName"));
  const mt = maintenanceTypes(formData);
  await prisma.maintenance.create({
    data: {
      vehicleId,
      type: mt.type,
      types: mt.types,
      title: optStr(formData.get("title")),
      performedAt: reqDate(formData.get("performedAt")),
      mileage: optInt(formData.get("mileage")),
      cost: optFloat(formData.get("cost")),
      serviceName,
      nextDueDate: optDate(formData.get("nextDueDate")),
      nextDueMileage: optInt(formData.get("nextDueMileage")),
      notes: optStr(formData.get("notes")),
    },
  });
  if (vehicle) await rememberService(vehicle.garageId, serviceName);
  refresh(vehicleId);
}

export async function updateMaintenance(
  vehicleId: string,
  id: string,
  formData: FormData
) {
  const vehicle = await guard(vehicleId);
  const serviceName = optStr(formData.get("serviceName"));
  const mt = maintenanceTypes(formData);
  await prisma.maintenance.updateMany({
    where: { id, vehicleId },
    data: {
      type: mt.type,
      types: mt.types,
      title: optStr(formData.get("title")),
      performedAt: reqDate(formData.get("performedAt")),
      mileage: optInt(formData.get("mileage")),
      cost: optFloat(formData.get("cost")),
      serviceName,
      nextDueDate: optDate(formData.get("nextDueDate")),
      nextDueMileage: optInt(formData.get("nextDueMileage")),
      notes: optStr(formData.get("notes")),
    },
  });
  if (vehicle) await rememberService(vehicle.garageId, serviceName);
  refresh(vehicleId);
}

export async function deleteMaintenance(vehicleId: string, id: string) {
  await guard(vehicleId);
  await prisma.maintenance.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}

// --- Réparations ---

export async function addRepair(vehicleId: string, formData: FormData) {
  const vehicle = await guard(vehicleId);
  const serviceName = optStr(formData.get("serviceName"));
  await prisma.repair.create({
    data: {
      vehicleId,
      title: String(formData.get("title") ?? "").trim() || "Réparation",
      performedAt: reqDate(formData.get("performedAt")),
      mileage: optInt(formData.get("mileage")),
      cost: optFloat(formData.get("cost")),
      serviceName,
      underWarranty: bool(formData.get("underWarranty")),
      notes: optStr(formData.get("notes")),
    },
  });
  if (vehicle) await rememberService(vehicle.garageId, serviceName);
  refresh(vehicleId);
}

export async function updateRepair(
  vehicleId: string,
  id: string,
  formData: FormData
) {
  const vehicle = await guard(vehicleId);
  const serviceName = optStr(formData.get("serviceName"));
  await prisma.repair.updateMany({
    where: { id, vehicleId },
    data: {
      title: String(formData.get("title") ?? "").trim() || "Réparation",
      performedAt: reqDate(formData.get("performedAt")),
      mileage: optInt(formData.get("mileage")),
      cost: optFloat(formData.get("cost")),
      serviceName,
      underWarranty: bool(formData.get("underWarranty")),
      notes: optStr(formData.get("notes")),
    },
  });
  if (vehicle) await rememberService(vehicle.garageId, serviceName);
  refresh(vehicleId);
}

export async function deleteRepair(vehicleId: string, id: string) {
  await guard(vehicleId);
  await prisma.repair.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}

// --- Carburant ---

export async function addFuel(vehicleId: string, formData: FormData) {
  await guard(vehicleId);
  const liters = reqFloat(formData.get("liters"));
  const pricePerLiter = optFloat(formData.get("pricePerLiter"));
  let totalCost = optFloat(formData.get("totalCost"));
  if (totalCost == null && pricePerLiter != null) {
    totalCost = Math.round(liters * pricePerLiter * 100) / 100;
  }
  await prisma.fuelEntry.create({
    data: {
      vehicleId,
      filledAt: reqDate(formData.get("filledAt")),
      mileage: optInt(formData.get("mileage")),
      liters,
      pricePerLiter,
      totalCost,
      fullTank: bool(formData.get("fullTank")),
      station: optStr(formData.get("station")),
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function updateFuel(
  vehicleId: string,
  id: string,
  formData: FormData
) {
  await guard(vehicleId);
  const liters = reqFloat(formData.get("liters"));
  const pricePerLiter = optFloat(formData.get("pricePerLiter"));
  let totalCost = optFloat(formData.get("totalCost"));
  if (totalCost == null && pricePerLiter != null) {
    totalCost = Math.round(liters * pricePerLiter * 100) / 100;
  }
  await prisma.fuelEntry.updateMany({
    where: { id, vehicleId },
    data: {
      filledAt: reqDate(formData.get("filledAt")),
      mileage: optInt(formData.get("mileage")),
      liters,
      pricePerLiter,
      totalCost,
      fullTank: bool(formData.get("fullTank")),
      station: optStr(formData.get("station")),
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function deleteFuel(vehicleId: string, id: string) {
  await guard(vehicleId);
  await prisma.fuelEntry.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}

// --- Relevés kilométriques ---

export async function addMileage(vehicleId: string, formData: FormData) {
  await guard(vehicleId);
  await prisma.mileageEntry.create({
    data: {
      vehicleId,
      readAt: reqDate(formData.get("readAt")),
      mileage: optInt(formData.get("mileage")) ?? 0,
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function updateMileage(
  vehicleId: string,
  id: string,
  formData: FormData
) {
  await guard(vehicleId);
  await prisma.mileageEntry.updateMany({
    where: { id, vehicleId },
    data: {
      readAt: reqDate(formData.get("readAt")),
      mileage: optInt(formData.get("mileage")) ?? 0,
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function deleteMileage(vehicleId: string, id: string) {
  await guard(vehicleId);
  await prisma.mileageEntry.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}

// --- Documents administratifs ---

export async function addDocument(vehicleId: string, formData: FormData) {
  await guard(vehicleId);
  await prisma.document.create({
    data: {
      vehicleId,
      type: enumVal(DocumentType, formData.get("type"), DocumentType.ASSURANCE),
      label: optStr(formData.get("label")),
      provider: optStr(formData.get("provider")),
      issuedAt: optDate(formData.get("issuedAt")),
      expiresAt: optDate(formData.get("expiresAt")),
      cost: optFloat(formData.get("cost")),
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function updateDocument(
  vehicleId: string,
  id: string,
  formData: FormData
) {
  await guard(vehicleId);
  await prisma.document.updateMany({
    where: { id, vehicleId },
    data: {
      type: enumVal(DocumentType, formData.get("type"), DocumentType.ASSURANCE),
      label: optStr(formData.get("label")),
      provider: optStr(formData.get("provider")),
      issuedAt: optDate(formData.get("issuedAt")),
      expiresAt: optDate(formData.get("expiresAt")),
      cost: optFloat(formData.get("cost")),
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function deleteDocument(vehicleId: string, id: string) {
  await guard(vehicleId);
  await prisma.document.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}

// --- Rappels ---

export async function addReminder(vehicleId: string, formData: FormData) {
  await guard(vehicleId);
  await prisma.reminder.create({
    data: {
      vehicleId,
      kind: enumVal(ReminderKind, formData.get("kind"), ReminderKind.MAINTENANCE),
      label: String(formData.get("label") ?? "").trim() || "Rappel",
      dueDate: optDate(formData.get("dueDate")),
      dueMileage: optInt(formData.get("dueMileage")),
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function updateReminder(
  vehicleId: string,
  id: string,
  formData: FormData
) {
  await guard(vehicleId);
  await prisma.reminder.updateMany({
    where: { id, vehicleId },
    data: {
      kind: enumVal(ReminderKind, formData.get("kind"), ReminderKind.MAINTENANCE),
      label: String(formData.get("label") ?? "").trim() || "Rappel",
      dueDate: optDate(formData.get("dueDate")),
      dueMileage: optInt(formData.get("dueMileage")),
      notes: optStr(formData.get("notes")),
    },
  });
  refresh(vehicleId);
}

export async function toggleReminder(
  vehicleId: string,
  id: string,
  done: boolean
) {
  await guard(vehicleId);
  await prisma.reminder.updateMany({ where: { id, vehicleId }, data: { done } });
  refresh(vehicleId);
}

export async function deleteReminder(vehicleId: string, id: string) {
  await guard(vehicleId);
  await prisma.reminder.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}

// --- Catalogue de garages / prestataires (par garage) ---

export async function addServiceContact(vehicleId: string, formData: FormData) {
  const vehicle = await guard(vehicleId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !vehicle) return;
  const data = {
    brand: optStr(formData.get("brand")),
    address: optStr(formData.get("address")),
    postalCode: optStr(formData.get("postalCode")),
    city: optStr(formData.get("city")),
    phone: optStr(formData.get("phone")),
    notes: optStr(formData.get("notes")),
  };
  await prisma.serviceContact.upsert({
    where: { garageId_name: { garageId: vehicle.garageId, name } },
    create: { garageId: vehicle.garageId, name, ...data },
    update: data,
  });
  refresh(vehicleId);
}

export async function deleteServiceContact(vehicleId: string, id: string) {
  const vehicle = await guard(vehicleId);
  if (!vehicle) return;
  await prisma.serviceContact.deleteMany({
    where: { id, garageId: vehicle.garageId },
  });
  refresh(vehicleId);
}

// --- Partage du véhicule entre garages ---

export async function shareVehicle(vehicleId: string, garageId: string) {
  const user = await requireUser();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return;
  // On ne partage qu'avec un garage dont l'utilisateur est membre.
  const userGarages = await getUserGarageIds(user.id);
  if (!userGarages.includes(garageId) || garageId === vehicle.garageId) return;
  await prisma.vehicleShare.upsert({
    where: { vehicleId_garageId: { vehicleId, garageId } },
    create: { vehicleId, garageId },
    update: {},
  });
  refresh(vehicleId);
}

export async function unshareVehicle(vehicleId: string, garageId: string) {
  const user = await requireUser();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return;
  await prisma.vehicleShare.deleteMany({ where: { vehicleId, garageId } });
  refresh(vehicleId);
}

/** Importe la liste de départ d'enseignes dans le catalogue du garage. */
export async function importStarterServices(vehicleId: string) {
  const vehicle = await guard(vehicleId);
  if (!vehicle) return;
  for (const s of STARTER_SERVICES) {
    await prisma.serviceContact.upsert({
      where: { garageId_name: { garageId: vehicle.garageId, name: s.name } },
      create: { garageId: vehicle.garageId, name: s.name, brand: s.brand ?? null },
      update: {},
    });
  }
  refresh(vehicleId);
}
