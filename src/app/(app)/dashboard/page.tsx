import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccessibleVehicles, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { VehicleForm } from "@/components/VehicleForm";
import { createVehicle } from "@/app/(app)/vehicles/actions";
import { FUEL_TYPE_LABELS, dueStatus, DUE_STATUS_STYLE } from "@/lib/labels";
import { formatMileage } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const vehicles = await getAccessibleVehicles(user.id);

  // Pour chaque véhicule : kilométrage courant + échéance la plus proche
  // (rappels non faits + documents avec date d'expiration).
  const infoByVehicle = new Map<
    string,
    { mileage: number | null; nextDue: Date | null }
  >();
  await Promise.all(
    vehicles.map(async (v) => {
      const [mileage, reminder, doc] = await Promise.all([
        currentMileage(v.id, v.initialMileage),
        prisma.reminder.findFirst({
          where: { vehicleId: v.id, done: false, dueDate: { not: null } },
          orderBy: { dueDate: "asc" },
        }),
        prisma.document.findFirst({
          where: { vehicleId: v.id, expiresAt: { not: null } },
          orderBy: { expiresAt: "asc" },
        }),
      ]);
      const dates = [reminder?.dueDate, doc?.expiresAt].filter(
        (d): d is Date => d != null
      );
      const nextDue =
        dates.length > 0
          ? new Date(Math.min(...dates.map((d) => d.getTime())))
          : null;
      infoByVehicle.set(v.id, { mileage, nextDue });
    })
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mes véhicules</h1>
          <p className="text-sm text-gray-500">Bonjour {user.name} 👋</p>
        </div>
        <Modal trigger="+ Ajouter un véhicule" title="Ajouter un véhicule">
          <VehicleForm action={createVehicle} submitLabel="Créer le véhicule" />
        </Modal>
      </div>

      {vehicles.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-16 w-16 rounded-2xl opacity-80" />
          <h2 className="text-lg font-semibold">Bienvenue sur Carnet Auto</h2>
          <p className="max-w-sm text-sm text-gray-500">
            Commencez par ajouter un véhicule pour suivre ses entretiens, ses
            réparations, ses pleins de carburant et ses échéances (contrôle
            technique, assurance).
          </p>
          <Modal trigger="Ajouter mon véhicule" title="Ajouter un véhicule">
            <VehicleForm action={createVehicle} submitLabel="Créer le véhicule" />
          </Modal>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => {
            const info = infoByVehicle.get(v.id);
            const status = dueStatus(info?.nextDue, null, info?.mileage);
            const style = DUE_STATUS_STYLE[status];
            return (
              <Link
                key={v.id}
                href={`/vehicles/${v.id}`}
                className="card block hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{v.name}</h3>
                  {status !== "unknown" && (
                    <span className={`badge ${style.className}`}>
                      {style.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {[v.make, v.model, v.year].filter(Boolean).join(" · ") ||
                    FUEL_TYPE_LABELS[v.fuelType]}
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    {info?.mileage != null
                      ? info.mileage.toLocaleString("fr-FR")
                      : "—"}
                  </span>
                  <span className="text-xs text-gray-500">km</span>
                </div>
                {v.plate && (
                  <p className="mt-1 text-xs text-gray-400">{v.plate}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
