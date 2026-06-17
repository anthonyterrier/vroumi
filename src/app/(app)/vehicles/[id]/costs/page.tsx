import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { CostChart, type CostSlice } from "@/components/CostChart";
import { PrintButton } from "@/components/PrintButton";
import { formatEuro, formatUsage } from "@/lib/format";
import { usageUnitLabel } from "@/lib/labels";

export default async function CostsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [maint, repairs, fuel, docs, mileage] = await Promise.all([
    prisma.maintenance.findMany({
      where: { vehicleId: vehicle.id },
      select: { cost: true, performedAt: true },
    }),
    prisma.repair.findMany({
      where: { vehicleId: vehicle.id },
      select: { cost: true, performedAt: true },
    }),
    prisma.fuelEntry.findMany({
      where: { vehicleId: vehicle.id },
      select: { totalCost: true, filledAt: true },
    }),
    prisma.document.findMany({
      where: { vehicleId: vehicle.id },
      select: { cost: true, createdAt: true },
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

  const sum = (arr: { cost: number | null }[]) =>
    arr.reduce((s, x) => s + (x.cost ?? 0), 0);

  const maintTotal = sum(maint);
  const repairTotal = sum(repairs);
  const fuelTotal = fuel.reduce((s, f) => s + (f.totalCost ?? 0), 0);
  const docTotal = sum(docs);
  const grandTotal = maintTotal + repairTotal + fuelTotal + docTotal;

  const slices: CostSlice[] = [
    { label: "Entretiens", amount: Math.round(maintTotal) },
    { label: "Réparations", amount: Math.round(repairTotal) },
    { label: "Carburant", amount: Math.round(fuelTotal) },
    { label: "Documents", amount: Math.round(docTotal) },
  ];

  // Coût par km (sur la base du kilométrage parcouru depuis le km initial).
  const distance =
    mileage != null && vehicle.initialMileage != null
      ? mileage - vehicle.initialMileage
      : null;
  const costPerKm =
    distance && distance > 0 ? grandTotal / distance : null;

  // Synthèse par année (toutes catégories).
  const byYear = new Map<number, number>();
  const add = (date: Date, amount: number) => {
    if (!amount) return;
    const y = date.getFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + amount);
  };
  maint.forEach((m) => add(m.performedAt, m.cost ?? 0));
  repairs.forEach((r) => add(r.performedAt, r.cost ?? 0));
  fuel.forEach((f) => add(f.filledAt, f.totalCost ?? 0));
  docs.forEach((d) => add(d.createdAt, d.cost ?? 0));
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Coûts</h2>
        <div className="flex gap-2">
          <a
            href={`/api/vehicles/${vehicle.id}/export`}
            className="btn-secondary no-print"
          >
            Export CSV
          </a>
          <a
            href={`/api/vehicles/${vehicle.id}/report/pdf`}
            className="btn-secondary no-print"
          >
            Rapport PDF
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card text-center">
          <div className="text-lg font-bold">{formatEuro(grandTotal)}</div>
          <div className="text-[11px] text-gray-400">Total</div>
        </div>
        <div className="card text-center">
          <div className="text-lg font-bold">{formatEuro(fuelTotal)}</div>
          <div className="text-[11px] text-gray-400">Carburant</div>
        </div>
        <div className="card text-center">
          <div className="text-lg font-bold">
            {formatEuro(maintTotal + repairTotal)}
          </div>
          <div className="text-[11px] text-gray-400">Mécanique</div>
        </div>
        <div className="card text-center">
          <div className="text-lg font-bold">
            {costPerKm != null ? `${costPerKm.toFixed(2)} €` : "—"}
          </div>
          <div className="text-[11px] text-gray-400">
            par {usageUnitLabel(vehicle.usageUnit)}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">
          Répartition des coûts
        </h3>
        <CostChart slices={slices} />
      </div>

      {years.length > 0 && (
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold text-gray-600">Par année</h3>
          <table className="w-full text-sm">
            <tbody>
              {years.map(([year, amount]) => (
                <tr key={year} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 text-gray-600">{year}</td>
                  <td className="py-2 text-right font-medium">
                    {formatEuro(amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Compteur courant estimé : {formatUsage(mileage, vehicle.usageUnit)}
        {distance != null
          ? ` · ${formatUsage(distance, vehicle.usageUnit)} parcourus`
          : ""}
      </p>
    </div>
  );
}
