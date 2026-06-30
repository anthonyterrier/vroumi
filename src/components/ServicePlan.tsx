"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import {
  uploadServicePlan,
  deleteServicePlan,
  analyzeServicePlan,
  type ServicePlanState,
} from "@/app/(app)/vehicles/[id]/doc-actions";
import { isPdf } from "@/lib/carte-grise-fields";
import {
  formatPlanInterval,
  type ServicePlanItem,
} from "@/lib/service-plan-fields";

/**
 * Section « Plan d'entretien (carnet constructeur) » : envoi d'une photo/PDF de
 * la page du programme d'entretien, analyse IA → intervalles propres au
 * véhicule (qui priment alors sur les rythmes génériques).
 */
export function ServicePlan({
  vehicleId,
  docVersion,
  mimeType,
  aiEnabled,
  canManage,
  items,
  usageUnit,
}: {
  vehicleId: string;
  docVersion: number | null;
  mimeType: string | null;
  aiEnabled: boolean;
  canManage: boolean;
  items: ServicePlanItem[];
  usageUnit: string | null;
}) {
  const hasDoc = docVersion != null;
  const fileUrl = `/api/vehicles/${vehicleId}/service-plan?v=${docVersion}`;
  const [state, analyzeAction] = useActionState<ServicePlanState, FormData>(
    analyzeServicePlan.bind(null, vehicleId),
    undefined
  );
  const rows = state?.items ?? items;

  return (
    <div className="card space-y-4">
      <p className="text-sm text-gray-500">
        Envoie la page « programme d&apos;entretien » du carnet constructeur :
        l&apos;IA en extrait les périodicités réelles de ce véhicule, qui
        remplacent alors les rythmes indicatifs sur l&apos;onglet Entretiens.
      </p>

      {hasDoc && (
        <div className="space-y-3">
          {isPdf(mimeType) ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:underline"
            >
              Ouvrir le document (PDF)
            </a>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={fileUrl}
              alt="Plan d'entretien"
              className="max-h-72 w-full rounded-lg border border-gray-200 object-contain"
            />
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-3">
              <form action={analyzeAction}>
                <SubmitButton className="btn-primary" pendingLabel="Analyse en cours…">
                  {aiEnabled ? "Analyser avec l'IA" : "Analyse IA indisponible"}
                </SubmitButton>
              </form>
              <form action={deleteServicePlan.bind(null, vehicleId)}>
                <DeleteButton
                  label="Supprimer"
                  confirmMessage="Supprimer le plan d'entretien ?"
                />
              </form>
            </div>
          )}
          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {state.message}
            </p>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-sm font-semibold text-gray-700">
            Intervalles du carnet constructeur
          </p>
          <ul className="space-y-1">
            {rows.map((it, idx) => (
              <li
                key={`${it.label}-${idx}`}
                className="flex justify-between gap-2 text-sm"
              >
                <span className="text-gray-700">{it.label}</span>
                <span className="text-right text-gray-500">
                  {formatPlanInterval(it, usageUnit)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && (
        <form
          action={uploadServicePlan.bind(null, vehicleId)}
          className="space-y-2"
        >
          <label className="label">
            {hasDoc ? "Remplacer le document" : "Ajouter le plan d'entretien"}{" "}
            <span className="font-normal text-gray-400">
              (JPEG, PNG, WebP ou PDF, 8 Mo max)
            </span>
          </label>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="input"
            required
          />
          <SubmitButton className="btn-secondary" pendingLabel="Envoi…">
            Envoyer le document
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
