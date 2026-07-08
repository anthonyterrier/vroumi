import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { getEffectiveVehiclePerms } from "@/lib/perms";
import { prisma } from "@/lib/prisma";
import { ObdDiagnostic } from "@/components/ObdDiagnostic";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteDiagnosticReport } from "@/app/(app)/vehicles/[id]/diagnostic-actions";
import { OBD_AI_ENABLED } from "@/lib/obd-diagnosis";
import { formatDate, formatUsage } from "@/lib/format";

type StoredCode = { code: string; description: string; pending?: boolean };

export default async function DiagnosticPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, vehicle } = await requireVehicle(id);

  const [perms, reports, mileage] = await Promise.all([
    getEffectiveVehiclePerms(user.id, vehicle.id),
    prisma.diagnosticReport.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

  // Historique : on parse les codes de chaque relevé (ordre du plus récent au
  // plus ancien) pour pouvoir calculer les codes apparus / disparus.
  const history = reports.map((r) => {
    let codes: StoredCode[] = [];
    try {
      codes = JSON.parse(r.codes) as StoredCode[];
    } catch {
      codes = [];
    }
    return { r, codes, set: new Set(codes.map((c) => c.code)) };
  });
  // Codes du dernier relevé (pour le diff « en direct » côté OBD).
  const lastReportCodes = history[0] ? history[0].codes.map((c) => c.code) : [];
  const lastReportDate = history[0] ? formatDate(history[0].r.performedAt) : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Diagnostic OBD2</h2>
        <p className="text-sm text-gray-500">
          Lis les codes défaut et les données moteur via un adaptateur ELM327
          Bluetooth branché sur la prise OBD du véhicule.
        </p>
      </div>

      <ObdDiagnostic
        vehicleId={vehicle.id}
        canEditVehicle={perms.vehiclesEdit}
        canJournal={perms.maintenanceAdd}
        canSaveMileage={perms.mileageAdd}
        aiEnabled={OBD_AI_ENABLED}
        currentMileage={mileage}
        lastReportCodes={lastReportCodes}
        lastReportDate={lastReportDate}
      />

      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Historique des diagnostics</h3>
          <p className="text-xs text-gray-400">
            La voiture ne conserve pas d&apos;historique daté ; il est reconstruit
            en comparant vos relevés successifs (codes apparus / disparus).
          </p>
          {history.map((entry, i) => {
            const { r, codes } = entry;
            // Relevé précédent (plus ancien) = élément suivant dans la liste desc.
            const prev = history[i + 1];
            const appeared = prev
              ? codes.filter((c) => !prev.set.has(c.code))
              : [];
            const resolved = prev
              ? prev.codes.filter((c) => !entry.set.has(c.code))
              : [];
            return (
              <div key={r.id} className="card space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {formatDate(r.performedAt)}
                    {r.mileage != null
                      ? ` · ${formatUsage(r.mileage, vehicle.usageUnit)}`
                      : ""}
                  </p>
                  {perms.maintenanceDelete && (
                    <form
                      action={deleteDiagnosticReport.bind(null, vehicle.id, r.id)}
                    >
                      <DeleteButton confirmMessage="Supprimer ce relevé de diagnostic ?" />
                    </form>
                  )}
                </div>

                {prev && (appeared.length > 0 || resolved.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {appeared.map((c) => (
                      <span
                        key={`a-${c.code}`}
                        className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-800"
                        title={c.description}
                      >
                        ▲ {c.code} apparu
                      </span>
                    ))}
                    {resolved.map((c) => (
                      <span
                        key={`r-${c.code}`}
                        className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-800"
                        title={c.description}
                      >
                        ▼ {c.code} disparu
                      </span>
                    ))}
                  </div>
                )}

                {codes.length === 0 ? (
                  <p className="text-sm text-green-700">Aucun code défaut.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {codes.map((c) => (
                      <li key={c.code} className="text-sm">
                        <span className="font-mono font-semibold">{c.code}</span>{" "}
                        <span className="text-gray-600">— {c.description}</span>
                        {c.pending ? " (en attente)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {r.voltage != null && (
                  <p className="text-xs text-gray-500">
                    Tension : {r.voltage.toFixed(1)} V
                  </p>
                )}
                {r.vin && (
                  <p className="font-mono text-xs text-gray-500">VIN : {r.vin}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
