import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { getEffectiveVehiclePerms } from "@/lib/perms";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { MaintenanceAttachments } from "@/components/MaintenanceAttachments";
import { MaintenanceFields } from "@/components/MaintenanceFields";
import { AddMaintenanceForm } from "@/components/AddMaintenanceForm";
import {
  updateMaintenance,
  deleteMaintenance,
  addMaintenance,
} from "@/app/(app)/vehicles/[id]/actions";
import { INVOICE_AI_ENABLED } from "@/lib/maintenance-invoice";
import {
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPE_ICON,
  FUEL_TYPE_LABELS,
  maintenanceTypeKeys,
  maintenanceTypeLabel,
} from "@/lib/labels";
import {
  MAINTENANCE_DISCLAIMER,
  intervalsForVehicle,
  formatInterval,
} from "@/lib/maintenance-intervals";
import {
  parseServicePlan,
  formatPlanInterval,
} from "@/lib/service-plan-fields";
import { formatDate, formatUsage, formatEuro } from "@/lib/format";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, vehicle } = await requireVehicle(id);

  const [items, services, mileage, perms] = await Promise.all([
    prisma.maintenance.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
      include: {
        attachments: {
          select: { id: true, mimeType: true, fileName: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.serviceContact.findMany({
      where: { garageId: vehicle.garageId },
      orderBy: { name: "asc" },
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
    getEffectiveVehiclePerms(user.id, vehicle.id),
  ]);
  const canEdit = perms.maintenanceEdit;

  // Intervalles issus du carnet constructeur (s'ils existent, ils priment).
  const planItems = parseServicePlan(
    (vehicle as unknown as { servicePlanIntervals?: string }).servicePlanIntervals
  );

  const addAction = addMaintenance.bind(null, vehicle.id);
  const total = items.reduce((s, m) => s + (m.cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Entretiens</h2>
          {total > 0 && (
            <p className="text-xs text-gray-400">Total : {formatEuro(total)}</p>
          )}
        </div>
        <Modal trigger="+ Entretien" title="Ajouter un entretien">
          <AddMaintenanceForm
            vehicleId={vehicle.id}
            services={services}
            unit={vehicle.usageUnit}
            action={addAction}
            aiEnabled={INVOICE_AI_ENABLED}
          />
        </Modal>
      </div>

      {planItems.length > 0 && (
        <details
          open
          className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm"
        >
          <summary className="cursor-pointer font-medium text-brand-800">
            Plan d&apos;entretien · carnet constructeur
          </summary>
          <ul className="mt-2 space-y-1">
            {planItems.map((it, idx) => (
              <li
                key={`${it.label}-${idx}`}
                className="flex justify-between gap-2 text-gray-700"
              >
                <span>{it.label}</span>
                <span className="text-right text-gray-500">
                  {formatPlanInterval(it, vehicle.usageUnit)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">{MAINTENANCE_DISCLAIMER}</p>
        </details>
      )}

      <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-gray-700">
          Rythmes d&apos;entretien indicatifs (génériques) ·{" "}
          {FUEL_TYPE_LABELS[vehicle.fuelType] ?? "véhicule"}
        </summary>
        <ul className="mt-2 space-y-1">
          {Object.entries(intervalsForVehicle(vehicle.fuelType)).map(
            ([type, interval]) => (
              <li
                key={type}
                className="flex justify-between gap-2 text-gray-600"
              >
                <span>
                  {MAINTENANCE_TYPE_ICON[type]}{" "}
                  {MAINTENANCE_TYPE_LABELS[type] ?? type}
                </span>
                <span className="text-right text-gray-500">
                  {formatInterval(interval, vehicle.usageUnit)}
                </span>
              </li>
            )
          )}
        </ul>
        <p className="mt-2 text-[11px] text-gray-400">
          {MAINTENANCE_DISCLAIMER}
        </p>
      </details>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucun entretien pour le moment.
          </p>
        )}
        {items.map((m) => (
          <div key={m.id} className="card flex items-center gap-3 py-3">
            <span className="text-xl">
              {MAINTENANCE_TYPE_ICON[maintenanceTypeKeys(m)[0]] ?? "🔧"}
            </span>
            <div className="flex-1">
              <p className="font-medium">{maintenanceTypeLabel(m)}</p>
              {m.title && (
                <p className="text-xs text-gray-500">{m.title}</p>
              )}
              <p className="text-xs text-gray-400">
                {formatDate(m.performedAt)}
                {m.mileage ? ` · ${formatUsage(m.mileage, vehicle.usageUnit)}` : ""}
                {m.serviceName ? ` · ${m.serviceName}` : ""}
              </p>
              {m.nextDueDate || m.nextDueMileage ? (
                <p className="text-xs text-brand-600">
                  Prochaine :{" "}
                  {m.nextDueDate ? formatDate(m.nextDueDate) : ""}
                  {m.nextDueMileage ? ` · ${formatUsage(m.nextDueMileage, vehicle.usageUnit)}` : ""}
                </p>
              ) : null}
              {m.notes && <p className="mt-1 text-sm text-gray-600">{m.notes}</p>}
              <MaintenanceAttachments
                vehicleId={vehicle.id}
                maintenanceId={m.id}
                attachments={m.attachments}
                canEdit={canEdit}
              />
            </div>
            {m.cost != null && (
              <span className="text-sm font-semibold">{formatEuro(m.cost)}</span>
            )}
            <Modal
              trigger="✏️"
              title="Modifier l'entretien"
              triggerClassName="px-2 text-gray-400 hover:text-brand-600"
            >
              <form
                action={updateMaintenance.bind(null, vehicle.id, m.id)}
                className="space-y-3"
              >
                <MaintenanceFields services={services} m={m} unit={vehicle.usageUnit} />
                <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
              </form>
            </Modal>
            <form action={deleteMaintenance.bind(null, vehicle.id, m.id)}>
              <DeleteButton confirmMessage="Supprimer cet entretien ?" />
            </form>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        Compteur courant estimé : {formatUsage(mileage, vehicle.usageUnit)}
      </p>
    </div>
  );
}
