import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  maintenanceTypeKeys,
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPE_ICON,
  VEHICLE_CATEGORY_ICON,
  usageUnitLabel,
} from "@/lib/labels";
import {
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_STYLE,
  DEFECT_SEVERITY_LABELS,
  DEFECT_SEVERITY_STYLE,
  DEFECT_SEVERITY_ORDER,
} from "@/lib/technical-inspection-fields";
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
      inspections: {
        orderBy: { performedAt: "desc" },
        include: { defects: true },
      },
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
          <Link href="/login" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
            <span className="font-bold text-gray-900">Vroumi</span>
          </Link>
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
              {vehicle.maintenances.map((m) => {
                const keys = maintenanceTypeKeys(m);
                return (
                  <div key={m.id} className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-xs font-medium text-gray-500">
                      {formatDate(m.performedAt)}
                      {m.mileage != null
                        ? ` · ${formatUsage(m.mileage, unit)}`
                        : ""}
                      {m.serviceName ? ` · ${m.serviceName}` : ""}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {keys.map((k) => (
                        <li
                          key={k}
                          className="flex items-start gap-2 text-sm text-gray-800"
                        >
                          <span className="shrink-0">
                            {MAINTENANCE_TYPE_ICON[k] ?? "🔧"}
                          </span>
                          <span>{MAINTENANCE_TYPE_LABELS[k] ?? k}</span>
                        </li>
                      ))}
                    </ul>
                    {m.title && (
                      <p className="mt-1.5 text-sm text-gray-600">{m.title}</p>
                    )}
                    {m.notes && (
                      <p className="mt-1 text-sm text-gray-500">{m.notes}</p>
                    )}
                  </div>
                );
              })}
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

        {/* Contrôles techniques */}
        <section>
          <h2 className="mb-2 text-lg font-semibold">Contrôles techniques</h2>
          {vehicle.inspections.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-400 shadow-sm">
              Aucun contrôle technique enregistré.
            </p>
          ) : (
            <div className="space-y-2">
              {vehicle.inspections.map((insp) => {
                const defects = [...insp.defects].sort(
                  (a, b) =>
                    Number(a.fixed) - Number(b.fixed) ||
                    (DEFECT_SEVERITY_ORDER[a.severity] ?? 9) -
                      (DEFECT_SEVERITY_ORDER[b.severity] ?? 9)
                );
                const fixedCount = defects.filter((d) => d.fixed).length;
                return (
                  <div key={insp.id} className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${INSPECTION_RESULT_STYLE[insp.result]}`}
                      >
                        {INSPECTION_RESULT_LABELS[insp.result]}
                      </span>
                      <span className="text-sm font-medium">
                        {formatDate(insp.performedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {insp.mileage != null
                        ? formatUsage(insp.mileage, unit)
                        : ""}
                      {insp.center ? ` · ${insp.center}` : ""}
                      {insp.nextDueDate
                        ? ` · ${
                            insp.result === "FAVORABLE" ||
                            insp.result === "INCONNU"
                              ? "prochain contrôle"
                              : "contre-visite avant"
                          } ${formatDate(insp.nextDueDate)}`
                        : ""}
                    </p>
                    {defects.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-gray-500">
                          Points relevés — {fixedCount}/{defects.length} traité(s)
                        </p>
                        <ul className="mt-1 space-y-1">
                          {defects.map((d) => (
                            <li
                              key={d.id}
                              className="flex items-start justify-between gap-2 text-sm"
                            >
                              <span className="flex items-start gap-1.5">
                                <span
                                  className={`mt-0.5 shrink-0 rounded border px-1 py-0.5 text-[10px] ${DEFECT_SEVERITY_STYLE[d.severity]}`}
                                >
                                  {DEFECT_SEVERITY_LABELS[d.severity]}
                                </span>
                                <span
                                  className={
                                    d.fixed
                                      ? "text-gray-400 line-through"
                                      : "text-gray-700"
                                  }
                                >
                                  {d.description}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 text-[11px] ${
                                  d.fixed ? "text-green-600" : "text-amber-600"
                                }`}
                              >
                                {d.fixed ? "réparé" : "à faire"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
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
