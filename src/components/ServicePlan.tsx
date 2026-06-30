"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import {
  uploadServicePlanDoc,
  deleteServicePlanDoc,
  analyzeServicePlan,
  type ServicePlanState,
} from "@/app/(app)/vehicles/[id]/doc-actions";
import { isPdf } from "@/lib/carte-grise-fields";
import {
  formatPlanInterval,
  type ServicePlanItem,
} from "@/lib/service-plan-fields";

type Doc = { id: string; mimeType: string; fileName: string | null };

/**
 * Section « Plan d'entretien (carnet constructeur) » : plusieurs pages/photos
 * possibles ; l'IA les analyse toutes ensemble → intervalles propres au
 * véhicule (qui priment sur les rythmes génériques).
 */
export function ServicePlan({
  vehicleId,
  docs,
  aiEnabled,
  canManage,
  items,
  usageUnit,
}: {
  vehicleId: string;
  docs: Doc[];
  aiEnabled: boolean;
  canManage: boolean;
  items: ServicePlanItem[];
  usageUnit: string | null;
}) {
  const [state, analyzeAction] = useActionState<ServicePlanState, FormData>(
    analyzeServicePlan.bind(null, vehicleId),
    undefined
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const rows = state?.items ?? items;
  const MAX_MB = 20;

  return (
    <div className="card space-y-4">
      <p className="text-sm text-gray-500">
        Ajoute <strong>la ou les page(s) du programme d&apos;entretien</strong>{" "}
        du carnet (plusieurs photos possibles, pas la notice complète) : l&apos;IA
        analyse toutes les pages ensemble et en extrait les périodicités réelles
        de ce véhicule, qui remplacent les rythmes indicatifs sur l&apos;onglet
        Entretiens. Max {MAX_MB} Mo par page.
      </p>

      {docs.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {docs.map((doc) => {
              const url = `/api/vehicles/${vehicleId}/service-plan/${doc.id}`;
              return (
                <div
                  key={doc.id}
                  className="space-y-1 rounded-lg border border-gray-200 p-2"
                >
                  {isPdf(doc.mimeType) ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-brand-600 hover:underline"
                    >
                      📄 {doc.fileName ?? "Page PDF"}
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={doc.fileName ?? "Page"}
                        className="h-28 w-full rounded object-cover"
                      />
                    </a>
                  )}
                  {canManage && (
                    <form
                      action={deleteServicePlanDoc.bind(null, vehicleId, doc.id)}
                    >
                      <DeleteButton
                        label="Supprimer"
                        confirmMessage="Supprimer cette page ?"
                        className="text-xs text-red-600 hover:underline"
                      />
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          {canManage && (
            <form action={analyzeAction}>
              <SubmitButton className="btn-primary" pendingLabel="Analyse en cours…">
                {aiEnabled
                  ? `Analyser ${docs.length} page(s) avec l'IA`
                  : "Analyse IA indisponible"}
              </SubmitButton>
            </form>
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
          action={uploadServicePlanDoc.bind(null, vehicleId)}
          className="space-y-2"
          onSubmit={(e) => {
            const input = e.currentTarget.elements.namedItem(
              "file"
            ) as HTMLInputElement | null;
            const f = input?.files?.[0];
            if (f && f.size > MAX_MB * 1024 * 1024) {
              e.preventDefault();
              setUploadError(
                `Fichier trop volumineux (${(f.size / 1024 / 1024).toFixed(
                  0
                )} Mo, max ${MAX_MB} Mo par page).`
              );
            } else {
              setUploadError(null);
            }
          }}
        >
          <label className="label">
            Ajouter une page{" "}
            <span className="font-normal text-gray-400">
              (JPEG, PNG, WebP ou PDF, {MAX_MB} Mo max)
            </span>
          </label>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="input"
            required
          />
          {uploadError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {uploadError}
            </p>
          )}
          <SubmitButton className="btn-secondary" pendingLabel="Envoi…">
            Ajouter la page
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
