import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import { ServiceSelect } from "@/components/ServiceSelect";
import {
  addRepair,
  updateRepair,
  deleteRepair,
} from "@/app/(app)/vehicles/[id]/actions";
import { formatDate, formatMileage, formatEuro } from "@/lib/format";
import type { Repair } from "@prisma/client";

function RepairFields({
  services,
  r,
}: {
  services: { id: string; name: string; brand: string | null; city: string | null }[];
  r?: Repair;
}) {
  return (
    <>
      <div>
        <label className="label">Description *</label>
        <input
          name="title"
          className="input"
          required
          placeholder="ex. Remplacement alternateur"
          defaultValue={r?.title ?? ""}
          autoFocus={!r}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date</label>
          <TodayDateInput name="performedAt" iso={r?.performedAt.toISOString()} />
        </div>
        <div>
          <label className="label">Kilométrage</label>
          <input
            name="mileage"
            type="number"
            className="input"
            defaultValue={r?.mileage ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Coût (€)</label>
          <input
            name="cost"
            type="number"
            step="any"
            className="input"
            defaultValue={r?.cost ?? ""}
          />
        </div>
        <label className="flex items-center gap-2 pt-7 text-sm">
          <input
            type="checkbox"
            name="underWarranty"
            defaultChecked={r?.underWarranty ?? false}
          />
          Sous garantie
        </label>
      </div>
      <div>
        <label className="label">Garage / prestataire</label>
        <ServiceSelect services={services} defaultValue={r?.serviceName ?? ""} />
      </div>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={r?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function RepairsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [items, services] = await Promise.all([
    prisma.repair.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
    }),
    prisma.serviceContact.findMany({
      where: { garageId: vehicle.garageId },
      orderBy: { name: "asc" },
    }),
  ]);

  const addAction = addRepair.bind(null, vehicle.id);
  const total = items.reduce((s, r) => s + (r.cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Réparations</h2>
          {total > 0 && (
            <p className="text-xs text-gray-400">Total : {formatEuro(total)}</p>
          )}
        </div>
        <Modal trigger="+ Réparation" title="Ajouter une réparation">
          <form action={addAction} className="space-y-3">
            <RepairFields services={services} />
            <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
          </form>
        </Modal>
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucune réparation enregistrée.
          </p>
        )}
        {items.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 py-3">
            <span className="text-xl">🛠️</span>
            <div className="flex-1">
              <p className="font-medium">
                {r.title}
                {r.underWarranty && (
                  <span className="badge ml-2 border-green-200 bg-green-100 text-green-800">
                    Garantie
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(r.performedAt)}
                {r.mileage ? ` · ${formatMileage(r.mileage)}` : ""}
                {r.serviceName ? ` · ${r.serviceName}` : ""}
              </p>
              {r.notes && <p className="mt-1 text-sm text-gray-600">{r.notes}</p>}
            </div>
            {r.cost != null && (
              <span className="text-sm font-semibold">{formatEuro(r.cost)}</span>
            )}
            <Modal
              trigger="✏️"
              title="Modifier la réparation"
              triggerClassName="px-2 text-gray-400 hover:text-brand-600"
            >
              <form
                action={updateRepair.bind(null, vehicle.id, r.id)}
                className="space-y-3"
              >
                <RepairFields services={services} r={r} />
                <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
              </form>
            </Modal>
            <form action={deleteRepair.bind(null, vehicle.id, r.id)}>
              <DeleteButton confirmMessage="Supprimer cette réparation ?" />
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
