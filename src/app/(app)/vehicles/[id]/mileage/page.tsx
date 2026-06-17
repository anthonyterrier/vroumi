import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import { MileageChart, type MileagePoint } from "@/components/MileageChart";
import {
  addMileage,
  updateMileage,
  deleteMileage,
} from "@/app/(app)/vehicles/[id]/actions";
import { formatDate, formatUsage } from "@/lib/format";
import { usageUnitLabel } from "@/lib/labels";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { MileageEntry } from "@prisma/client";

function MileageFields({ e, unit }: { e?: MileageEntry; unit: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date</label>
          <TodayDateInput name="readAt" iso={e?.readAt.toISOString()} />
        </div>
        <div>
          <label className="label">Compteur ({usageUnitLabel(unit)}) *</label>
          <input
            name="mileage"
            type="number"
            className="input"
            required
            defaultValue={e?.mileage ?? ""}
            autoFocus={!e}
          />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={e?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function MileagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [entries, maint, fuel] = await Promise.all([
    prisma.mileageEntry.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { readAt: "desc" },
    }),
    prisma.maintenance.findMany({
      where: { vehicleId: vehicle.id, mileage: { not: null } },
      select: { performedAt: true, mileage: true },
    }),
    prisma.fuelEntry.findMany({
      where: { vehicleId: vehicle.id, mileage: { not: null } },
      select: { filledAt: true, mileage: true },
    }),
  ]);

  // Courbe : combine relevés dédiés + kilométrages connus (entretiens, pleins).
  const raw: { t: number; mileage: number }[] = [
    ...entries.map((e) => ({ t: e.readAt.getTime(), mileage: e.mileage })),
    ...maint.map((m) => ({ t: m.performedAt.getTime(), mileage: m.mileage! })),
    ...fuel.map((f) => ({ t: f.filledAt.getTime(), mileage: f.mileage! })),
  ];
  if (vehicle.initialMileage != null) {
    raw.push({
      t: vehicle.createdAt.getTime(),
      mileage: vehicle.initialMileage,
    });
  }
  const points: MileagePoint[] = raw
    .sort((a, b) => a.t - b.t)
    .map((p) => ({
      t: p.t,
      label: format(new Date(p.t), "dd/MM/yy", { locale: fr }),
      mileage: p.mileage,
    }));

  const addAction = addMileage.bind(null, vehicle.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {vehicle.usageUnit === "HOURS" ? "Heures moteur" : "Kilométrage"}
        </h2>
        <Modal trigger="+ Relevé" title="Ajouter un relevé">
          <form action={addAction} className="space-y-3">
            <MileageFields unit={vehicle.usageUnit} />
            <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
          </form>
        </Modal>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">Évolution</h3>
        <MileageChart points={points} unit={usageUnitLabel(vehicle.usageUnit)} />
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucun relevé dédié. La courbe utilise aussi les kilométrages des
            entretiens et des pleins.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="card flex items-center gap-3 py-3">
            <div className="flex-1">
              <p className="font-medium">{formatUsage(e.mileage, vehicle.usageUnit)}</p>
              <p className="text-xs text-gray-400">{formatDate(e.readAt)}</p>
              {e.notes && <p className="mt-1 text-sm text-gray-600">{e.notes}</p>}
            </div>
            <Modal
              trigger="✏️"
              title="Modifier le relevé"
              triggerClassName="px-2 text-gray-400 hover:text-brand-600"
            >
              <form
                action={updateMileage.bind(null, vehicle.id, e.id)}
                className="space-y-3"
              >
                <MileageFields e={e} unit={vehicle.usageUnit} />
                <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
              </form>
            </Modal>
            <form action={deleteMileage.bind(null, vehicle.id, e.id)}>
              <DeleteButton confirmMessage="Supprimer ce relevé ?" />
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
