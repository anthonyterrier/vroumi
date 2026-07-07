import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { getEffectiveVehiclePerms } from "@/lib/perms";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import { InspectionScanForm } from "@/components/InspectionScanForm";
import { DefectToggle } from "@/components/DefectToggle";
import {
  addInspection,
  deleteInspection,
} from "@/app/(app)/vehicles/[id]/inspection-actions";
import { INSPECTION_AI_ENABLED } from "@/lib/technical-inspection";
import {
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_STYLE,
  DEFECT_SEVERITY_LABELS,
  DEFECT_SEVERITY_STYLE,
  DEFECT_SEVERITY_ORDER,
} from "@/lib/technical-inspection-fields";
import { formatDate, formatUsage } from "@/lib/format";

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, vehicle } = await requireVehicle(id);

  const [perms, inspections, mileage] = await Promise.all([
    getEffectiveVehiclePerms(user.id, vehicle.id),
    prisma.technicalInspection.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
      include: { defects: true },
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

  const canAdd = perms.documentsAdd;
  const canEdit = perms.documentsEdit;
  const canDelete = perms.documentsDelete;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Contrôle technique</h2>
        <p className="text-sm text-gray-500">
          Suivi des contrôles techniques et des points à traiter, avec extraction
          automatique du compte rendu.
        </p>
      </div>

      {canAdd && (
        <div className="card space-y-3">
          {INSPECTION_AI_ENABLED ? (
            <InspectionScanForm vehicleId={vehicle.id} />
          ) : (
            <p className="text-sm text-gray-500">
              L&apos;analyse IA du compte rendu n&apos;est pas configurée sur ce
              serveur. Vous pouvez saisir un contrôle manuellement.
            </p>
          )}
          <div className="border-t border-gray-100 pt-3">
            <Modal
              trigger="+ Saisir manuellement"
              title="Ajouter un contrôle technique"
              triggerClassName="text-sm text-brand-600 hover:underline"
            >
              <form
                action={addInspection.bind(null, vehicle.id)}
                className="space-y-3"
              >
                <div>
                  <label className="label">Date du contrôle</label>
                  <TodayDateInput name="performedAt" />
                </div>
                <div>
                  <label className="label">Résultat</label>
                  <select name="result" className="input" defaultValue="FAVORABLE">
                    {Object.entries(INSPECTION_RESULT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Kilométrage</label>
                    <input name="mileage" type="number" className="input" />
                  </div>
                  <div>
                    <label className="label">Prochaine échéance</label>
                    <TodayDateInput name="nextDueDate" optional />
                  </div>
                </div>
                <div>
                  <label className="label">Centre</label>
                  <input name="center" className="input" />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input name="notes" className="input" />
                </div>
                <SubmitButton className="btn-primary w-full">
                  Enregistrer
                </SubmitButton>
              </form>
            </Modal>
          </div>
        </div>
      )}

      {inspections.length === 0 ? (
        <p className="card text-center text-sm text-gray-400">
          Aucun contrôle technique enregistré.
        </p>
      ) : (
        <div className="space-y-3">
          {inspections.map((insp) => {
            const defects = [...insp.defects].sort(
              (a, b) =>
                Number(a.fixed) - Number(b.fixed) ||
                (DEFECT_SEVERITY_ORDER[a.severity] ?? 9) -
                  (DEFECT_SEVERITY_ORDER[b.severity] ?? 9)
            );
            const fixedCount = defects.filter((d) => d.fixed).length;
            return (
              <div key={insp.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge ${INSPECTION_RESULT_STYLE[insp.result]}`}
                      >
                        {INSPECTION_RESULT_LABELS[insp.result]}
                      </span>
                      <span className="text-sm font-medium">
                        {formatDate(insp.performedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {insp.mileage != null
                        ? formatUsage(insp.mileage, vehicle.usageUnit)
                        : ""}
                      {insp.center ? ` · ${insp.center}` : ""}
                      {insp.nextDueDate
                        ? ` · échéance ${formatDate(insp.nextDueDate)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {insp.data && insp.mimeType && (
                      <a
                        href={`/api/vehicles/${vehicle.id}/inspection/${insp.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Compte rendu
                      </a>
                    )}
                    {canDelete && (
                      <form
                        action={deleteInspection.bind(null, vehicle.id, insp.id)}
                      >
                        <DeleteButton confirmMessage="Supprimer ce contrôle technique ?" />
                      </form>
                    )}
                  </div>
                </div>

                {defects.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-600">
                      Points à traiter — {fixedCount}/{defects.length} réparé(s)
                    </p>
                    <ul className="space-y-1.5">
                      {defects.map((d) => (
                        <li
                          key={d.id}
                          className={`flex items-start justify-between gap-2 rounded-lg border p-2 ${
                            d.fixed
                              ? "border-gray-100 bg-gray-50"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`badge ${DEFECT_SEVERITY_STYLE[d.severity]}`}
                              >
                                {DEFECT_SEVERITY_LABELS[d.severity]}
                              </span>
                              {d.code && (
                                <span className="font-mono text-[11px] text-gray-400">
                                  {d.code}
                                </span>
                              )}
                            </div>
                            <p
                              className={`mt-1 text-sm ${
                                d.fixed
                                  ? "text-gray-400 line-through"
                                  : "text-gray-700"
                              }`}
                            >
                              {d.description}
                            </p>
                          </div>
                          <DefectToggle
                            vehicleId={vehicle.id}
                            defectId={d.id}
                            fixed={d.fixed}
                            canEdit={canEdit}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-green-700">
                    Aucune défaillance relevée. 🎉
                  </p>
                )}

                {insp.notes && (
                  <p className="text-sm text-gray-600">{insp.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Compteur courant estimé : {formatUsage(mileage, vehicle.usageUnit)} ·
        Extraction IA indicative : vérifiez toujours le compte rendu officiel.
      </p>
    </div>
  );
}
