import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import {
  ConsumptionChart,
  type ConsumptionPoint,
} from "@/components/ConsumptionChart";
import { addFuel, updateFuel, deleteFuel } from "@/app/(app)/vehicles/[id]/actions";
import { formatDate, formatUsage, formatEuro } from "@/lib/format";
import { usageUnitLabel } from "@/lib/labels";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { FuelEntry } from "@prisma/client";

function FuelFields({ e, unit }: { e?: FuelEntry; unit: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date</label>
          <TodayDateInput name="filledAt" iso={e?.filledAt.toISOString()} />
        </div>
        <div>
          <label className="label">Compteur ({usageUnitLabel(unit)})</label>
          <input
            name="mileage"
            type="number"
            className="input"
            defaultValue={e?.mileage ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Litres *</label>
          <input
            name="liters"
            type="number"
            step="any"
            className="input"
            required
            defaultValue={e?.liters ?? ""}
            autoFocus={!e}
          />
        </div>
        <div>
          <label className="label">€ / litre</label>
          <input
            name="pricePerLiter"
            type="number"
            step="any"
            className="input"
            defaultValue={e?.pricePerLiter ?? ""}
            placeholder="1.85"
          />
        </div>
        <div>
          <label className="label">Total (€)</label>
          <input
            name="totalCost"
            type="number"
            step="any"
            className="input"
            defaultValue={e?.totalCost ?? ""}
            placeholder="auto"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="fullTank"
            defaultChecked={e?.fullTank ?? true}
          />
          Plein complet
        </label>
        <input
          name="station"
          className="input ml-3 flex-1"
          placeholder="Station (optionnel)"
          defaultValue={e?.station ?? ""}
        />
      </div>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={e?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function FuelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const entries = await prisma.fuelEntry.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { filledAt: "desc" },
  });

  // Consommation entre deux pleins COMPLETS consécutifs avec compteur renseigné.
  // En km : litres / distance × 100 (L/100 km). En heures : litres / heures (L/h).
  const isHours = vehicle.usageUnit === "HOURS";
  const consoUnitLabel = isHours ? "L/h" : "L/100 km";
  const factor = isHours ? 1 : 100;

  const fulls = [...entries]
    .filter((e) => e.fullTank && e.mileage != null)
    .sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());

  const points: ConsumptionPoint[] = [];
  let totalDistance = 0;
  let totalLiters = 0;
  for (let i = 1; i < fulls.length; i++) {
    const prev = fulls[i - 1];
    const cur = fulls[i];
    const dist = (cur.mileage ?? 0) - (prev.mileage ?? 0);
    if (dist > 0) {
      const consumption = (cur.liters / dist) * factor;
      points.push({
        label: format(cur.filledAt, "dd/MM/yy", { locale: fr }),
        consumption: Math.round(consumption * 10) / 10,
      });
      totalDistance += dist;
      totalLiters += cur.liters;
    }
  }
  const avgConsumption =
    totalDistance > 0 ? (totalLiters / totalDistance) * factor : null;

  const totalCost = entries.reduce((s, e) => s + (e.totalCost ?? 0), 0);
  const addAction = addFuel.bind(null, vehicle.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Carburant</h2>
          <p className="text-xs text-gray-400">
            {avgConsumption != null
              ? `Moyenne : ${avgConsumption.toFixed(1)} ${consoUnitLabel} · `
              : ""}
            Total : {formatEuro(totalCost)}
          </p>
        </div>
        <Modal trigger="+ Plein" title="Ajouter un plein">
          <form action={addAction} className="space-y-3">
            <FuelFields unit={vehicle.usageUnit} />
            <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
          </form>
        </Modal>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">
          Consommation ({consoUnitLabel})
        </h3>
        <ConsumptionChart points={points} unitLabel={consoUnitLabel} />
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucun plein enregistré.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="card flex items-center gap-3 py-3">
            <span className="text-xl">⛽</span>
            <div className="flex-1">
              <p className="font-medium">
                {e.liters.toLocaleString("fr-FR")} L
                {!e.fullTank && (
                  <span className="ml-2 text-xs text-gray-400">(partiel)</span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(e.filledAt)}
                {e.mileage ? ` · ${formatUsage(e.mileage, vehicle.usageUnit)}` : ""}
                {e.station ? ` · ${e.station}` : ""}
              </p>
            </div>
            {e.totalCost != null && (
              <span className="text-sm font-semibold">{formatEuro(e.totalCost)}</span>
            )}
            <Modal
              trigger="✏️"
              title="Modifier le plein"
              triggerClassName="px-2 text-gray-400 hover:text-brand-600"
            >
              <form
                action={updateFuel.bind(null, vehicle.id, e.id)}
                className="space-y-3"
              >
                <FuelFields e={e} unit={vehicle.usageUnit} />
                <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
              </form>
            </Modal>
            <form action={deleteFuel.bind(null, vehicle.id, e.id)}>
              <DeleteButton confirmMessage="Supprimer ce plein ?" />
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
