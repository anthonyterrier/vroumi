import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import { ServiceSelect } from "@/components/ServiceSelect";
import {
  addMaintenance,
  updateMaintenance,
  deleteMaintenance,
} from "@/app/(app)/vehicles/[id]/actions";
import {
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPE_ICON,
} from "@/lib/labels";
import { MAINTENANCE_DISCLAIMER } from "@/lib/maintenance-intervals";
import { formatDate, formatMileage, formatEuro } from "@/lib/format";
import type { Maintenance } from "@prisma/client";

function MaintenanceFields({
  services,
  m,
}: {
  services: { id: string; name: string; brand: string | null; city: string | null }[];
  m?: Maintenance;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue={m?.type ?? "VIDANGE"}>
            {Object.entries(MAINTENANCE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <TodayDateInput name="performedAt" iso={m?.performedAt.toISOString()} />
        </div>
      </div>
      <div>
        <label className="label">Précision (optionnel)</label>
        <input
          name="title"
          className="input"
          placeholder="ex. Vidange + filtre à huile"
          defaultValue={m?.title ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Kilométrage</label>
          <input
            name="mileage"
            type="number"
            className="input"
            defaultValue={m?.mileage ?? ""}
          />
        </div>
        <div>
          <label className="label">Coût (€)</label>
          <input
            name="cost"
            type="number"
            step="any"
            className="input"
            defaultValue={m?.cost ?? ""}
          />
        </div>
      </div>
      <div>
        <label className="label">Garage / prestataire</label>
        <ServiceSelect services={services} defaultValue={m?.serviceName ?? ""} />
      </div>
      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-xs font-medium text-gray-500">
          Prochaine échéance (optionnel)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <TodayDateInput
              name="nextDueDate"
              iso={m?.nextDueDate?.toISOString()}
              optional
            />
          </div>
          <div>
            <label className="label">Kilométrage</label>
            <input
              name="nextDueMileage"
              type="number"
              className="input"
              defaultValue={m?.nextDueMileage ?? ""}
            />
          </div>
        </div>
      </fieldset>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={m?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [items, services, mileage] = await Promise.all([
    prisma.maintenance.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
    }),
    prisma.serviceContact.findMany({
      where: { garageId: vehicle.garageId },
      orderBy: { name: "asc" },
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

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
          <form action={addAction} className="space-y-3">
            <MaintenanceFields services={services} />
            <p className="text-[11px] text-gray-400">{MAINTENANCE_DISCLAIMER}</p>
            <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
          </form>
        </Modal>
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucun entretien pour le moment.
          </p>
        )}
        {items.map((m) => (
          <div key={m.id} className="card flex items-center gap-3 py-3">
            <span className="text-xl">{MAINTENANCE_TYPE_ICON[m.type]}</span>
            <div className="flex-1">
              <p className="font-medium">
                {m.title || MAINTENANCE_TYPE_LABELS[m.type]}
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(m.performedAt)}
                {m.mileage ? ` · ${formatMileage(m.mileage)}` : ""}
                {m.serviceName ? ` · ${m.serviceName}` : ""}
              </p>
              {m.nextDueDate || m.nextDueMileage ? (
                <p className="text-xs text-brand-600">
                  Prochaine :{" "}
                  {m.nextDueDate ? formatDate(m.nextDueDate) : ""}
                  {m.nextDueMileage ? ` · ${formatMileage(m.nextDueMileage)}` : ""}
                </p>
              ) : null}
              {m.notes && <p className="mt-1 text-sm text-gray-600">{m.notes}</p>}
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
                <MaintenanceFields services={services} m={m} />
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
        Kilométrage courant estimé : {formatMileage(mileage)}
      </p>
    </div>
  );
}
