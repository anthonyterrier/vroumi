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
      />

      {reports.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Historique des diagnostics</h3>
          {reports.map((r) => {
            let codes: StoredCode[] = [];
            try {
              codes = JSON.parse(r.codes) as StoredCode[];
            } catch {
              codes = [];
            }
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
