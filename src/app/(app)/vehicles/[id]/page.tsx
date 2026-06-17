import Link from "next/link";
import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import {
  FUEL_TYPE_LABELS,
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPE_ICON,
  DOCUMENT_TYPE_LABELS,
  REMINDER_KIND_LABELS,
  dueStatus,
  DUE_STATUS_STYLE,
} from "@/lib/labels";
import { formatDate, formatMileage, formatEuro } from "@/lib/format";

export default async function VehicleOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [mileage, lastMaint, reminders, documents, costAgg, fuelCount] =
    await Promise.all([
      currentMileage(vehicle.id, vehicle.initialMileage),
      prisma.maintenance.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { performedAt: "desc" },
      }),
      prisma.reminder.findMany({
        where: { vehicleId: vehicle.id, done: false },
        orderBy: [{ dueDate: "asc" }],
        take: 5,
      }),
      prisma.document.findMany({
        where: { vehicleId: vehicle.id, expiresAt: { not: null } },
        orderBy: { expiresAt: "asc" },
        take: 5,
      }),
      Promise.all([
        prisma.maintenance.aggregate({
          where: { vehicleId: vehicle.id },
          _sum: { cost: true },
        }),
        prisma.repair.aggregate({
          where: { vehicleId: vehicle.id },
          _sum: { cost: true },
        }),
        prisma.fuelEntry.aggregate({
          where: { vehicleId: vehicle.id },
          _sum: { totalCost: true },
        }),
        prisma.document.aggregate({
          where: { vehicleId: vehicle.id },
          _sum: { cost: true },
        }),
      ]),
      prisma.fuelEntry.count({ where: { vehicleId: vehicle.id } }),
    ]);

  const totalCost =
    (costAgg[0]._sum.cost ?? 0) +
    (costAgg[1]._sum.cost ?? 0) +
    (costAgg[2]._sum.totalCost ?? 0) +
    (costAgg[3]._sum.cost ?? 0);

  const base = `/vehicles/${vehicle.id}`;

  return (
    <div className="space-y-5">
      {/* En-tête véhicule */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{vehicle.name}</h1>
            <p className="text-sm text-gray-500">
              {[vehicle.make, vehicle.model, vehicle.year]
                .filter(Boolean)
                .join(" · ") || FUEL_TYPE_LABELS[vehicle.fuelType]}
            </p>
          </div>
          <span className="badge border-gray-200 bg-gray-100 text-gray-600">
            {FUEL_TYPE_LABELS[vehicle.fuelType]}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold">{formatMileage(mileage)}</div>
            <div className="text-[11px] text-gray-400">Kilométrage</div>
          </div>
          <div>
            <div className="text-xl font-bold">{formatEuro(totalCost)}</div>
            <div className="text-[11px] text-gray-400">Coût total</div>
          </div>
          <div>
            <div className="text-xl font-bold">
              {vehicle.plate || "—"}
            </div>
            <div className="text-[11px] text-gray-400">Immatriculation</div>
          </div>
        </div>
        {vehicle.notes && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {vehicle.notes}
          </p>
        )}
      </div>

      {/* Échéances à venir */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600">À surveiller</h2>
          <Link href={`${base}/reminders`} className="text-xs text-brand-600 hover:underline">
            Tous les rappels
          </Link>
        </div>
        {reminders.length === 0 && documents.length === 0 ? (
          <p className="card text-center text-sm text-gray-400">
            Aucune échéance enregistrée. Ajoutez un rappel ou un document
            (contrôle technique, assurance…).
          </p>
        ) : (
          <div className="space-y-2">
            {reminders.map((r) => {
              const status = dueStatus(r.dueDate, r.dueMileage, mileage);
              const style = DUE_STATUS_STYLE[status];
              return (
                <Link
                  key={r.id}
                  href={`${base}/reminders`}
                  className="card flex items-center gap-3 py-3 hover:shadow-md"
                >
                  <span className="text-lg">🔔</span>
                  <div className="flex-1">
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-gray-400">
                      {REMINDER_KIND_LABELS[r.kind]}
                      {r.dueDate ? ` · ${formatDate(r.dueDate)}` : ""}
                      {r.dueMileage ? ` · ${formatMileage(r.dueMileage)}` : ""}
                    </p>
                  </div>
                  {status !== "unknown" && (
                    <span className={`badge ${style.className}`}>{style.label}</span>
                  )}
                </Link>
              );
            })}
            {documents.map((d) => {
              const status = dueStatus(d.expiresAt, null, mileage);
              const style = DUE_STATUS_STYLE[status];
              return (
                <Link
                  key={d.id}
                  href={`${base}/documents`}
                  className="card flex items-center gap-3 py-3 hover:shadow-md"
                >
                  <span className="text-lg">📄</span>
                  <div className="flex-1">
                    <p className="font-medium">
                      {DOCUMENT_TYPE_LABELS[d.type]}
                      {d.label ? ` — ${d.label}` : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      Expire le {d.expiresAt ? formatDate(d.expiresAt) : "—"}
                    </p>
                  </div>
                  {status !== "unknown" && (
                    <span className={`badge ${style.className}`}>{style.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Dernier entretien */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600">Dernier entretien</h2>
          <Link href={`${base}/maintenance`} className="text-xs text-brand-600 hover:underline">
            Voir tout
          </Link>
        </div>
        {lastMaint ? (
          <div className="card flex items-center gap-3">
            <span className="text-xl">{MAINTENANCE_TYPE_ICON[lastMaint.type]}</span>
            <div className="flex-1">
              <p className="font-medium">
                {lastMaint.title || MAINTENANCE_TYPE_LABELS[lastMaint.type]}
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(lastMaint.performedAt)}
                {lastMaint.mileage ? ` · ${formatMileage(lastMaint.mileage)}` : ""}
              </p>
            </div>
            {lastMaint.cost != null && (
              <span className="text-sm font-semibold">{formatEuro(lastMaint.cost)}</span>
            )}
          </div>
        ) : (
          <p className="card text-center text-sm text-gray-400">
            Aucun entretien enregistré.
          </p>
        )}
      </section>

      {/* Liens rapides */}
      <section className="grid grid-cols-2 gap-2">
        <Link href={`${base}/maintenance`} className="btn-secondary">🔧 Entretiens</Link>
        <Link href={`${base}/fuel`} className="btn-secondary">⛽ Carburant ({fuelCount})</Link>
        <Link href={`${base}/costs`} className="btn-secondary">📊 Coûts</Link>
        <Link href={`${base}/edit`} className="btn-secondary">⚙️ Profil</Link>
      </section>
    </div>
  );
}
