import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  maintenanceTypeLabel,
  maintenanceTypeKeys,
  MAINTENANCE_TYPE_ICON,
  VEHICLE_CATEGORY_ICON,
  usageUnitLabel,
} from "@/lib/labels";
import { formatDate, formatUsage } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PublicHistoryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const vehicle = await prisma.vehicle.findFirst({
    where: { publicToken: token, publicEnabled: true },
    include: {
      maintenances: { orderBy: { performedAt: "desc" } },
      repairs: { orderBy: { performedAt: "desc" } },
    },
  });
  if (!vehicle) notFound();

  const unit = vehicle.usageUnit;
  const subtitle = [vehicle.make, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-bold text-gray-900">Vroumi</span>
          <span className="ml-auto text-xs text-gray-400">
            Historique d&apos;entretien
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold">
            {VEHICLE_CATEGORY_ICON[vehicle.category]} {vehicle.name}
          </h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          {vehicle.plate && (
            <p className="mt-1 inline-block rounded border border-gray-300 px-2 py-0.5 text-sm font-medium tracking-wider">
              {vehicle.plate}
            </p>
          )}
        </section>

        {/* Entretiens */}
        <section>
          <h2 className="mb-2 text-lg font-semibold">Entretiens</h2>
          {vehicle.maintenances.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-400 shadow-sm">
              Aucun entretien enregistré.
            </p>
          ) : (
            <div className="space-y-2">
              {vehicle.maintenances.map((m) => (
                <div key={m.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="font-medium">
                    {maintenanceTypeKeys(m)
                      .map((k) => MAINTENANCE_TYPE_ICON[k])
                      .join(" ")}{" "}
                    {m.title || maintenanceTypeLabel(m)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(m.performedAt)}
                    {m.mileage != null
                      ? ` · ${formatUsage(m.mileage, unit)}`
                      : ""}
                    {m.serviceName ? ` · ${m.serviceName}` : ""}
                  </p>
                  {m.notes && (
                    <p className="mt-1 text-sm text-gray-600">{m.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Réparations */}
        <section>
          <h2 className="mb-2 text-lg font-semibold">Réparations</h2>
          {vehicle.repairs.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-400 shadow-sm">
              Aucune réparation enregistrée.
            </p>
          ) : (
            <div className="space-y-2">
              {vehicle.repairs.map((r) => (
                <div key={r.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="font-medium">
                    🔧 {r.title}
                    {r.underWarranty && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-800">
                        sous garantie
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(r.performedAt)}
                    {r.mileage != null
                      ? ` · ${formatUsage(r.mileage, unit)}`
                      : ""}
                    {r.serviceName ? ` · ${r.serviceName}` : ""}
                  </p>
                  {r.notes && (
                    <p className="mt-1 text-sm text-gray-600">{r.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="pt-2 text-center text-[11px] text-gray-400">
          Historique fourni par le propriétaire du véhicule · unité :{" "}
          {usageUnitLabel(unit)} · suivi avec Vroumi
        </p>
      </main>
    </div>
  );
}
