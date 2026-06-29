"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import {
  uploadRegistration,
  deleteRegistration,
  analyzeRegistration,
  applyRegistrationFields,
  type RegistrationState,
} from "@/app/(app)/vehicles/[id]/registration-actions";
import {
  CARTE_GRISE_FIELDS,
  formatFieldValue,
  type CarteGriseFields,
} from "@/lib/carte-grise-fields";

/**
 * Section « Carte grise » (réservée au propriétaire). Envoi/affichage/suppression
 * de la photo, analyse IA, et aperçu des champs détectés avec validation
 * (case à cocher) champ par champ avant application au profil.
 */
export function CarteGrise({
  vehicleId,
  imageVersion,
  aiEnabled,
  canManage,
  previewFields,
  storedInfo,
}: {
  vehicleId: string;
  imageVersion: number | null;
  aiEnabled: boolean;
  canManage: boolean;
  previewFields: CarteGriseFields | null;
  storedInfo: { label: string; value: string }[];
}) {
  const hasImage = imageVersion != null;
  const [state, analyzeAction] = useActionState<RegistrationState, FormData>(
    analyzeRegistration.bind(null, vehicleId),
    undefined
  );

  // Aperçu courant : résultat de l'analyse fraîche, sinon dernière analyse stockée.
  const preview = state?.fields ?? previewFields;
  const detected = preview
    ? CARTE_GRISE_FIELDS.filter((f) => preview[f.key] != null)
    : [];

  return (
    <div className="card space-y-4">
      <p className="text-sm text-gray-500">
        Document confidentiel, visible uniquement par le propriétaire du
        véhicule. L&apos;analyse IA lit la photo, puis vous validez champ par
        champ les informations à enregistrer dans le profil.
      </p>

      {hasImage && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/vehicles/${vehicleId}/carte-grise?v=${imageVersion}`}
            alt="Carte grise"
            className="max-h-72 w-full rounded-lg border border-gray-200 object-contain"
          />
          {canManage && (
            <div className="flex flex-wrap items-center gap-3">
              <form action={analyzeAction}>
                <SubmitButton className="btn-primary" pendingLabel="Analyse en cours…">
                  {aiEnabled ? "Analyser avec l'IA" : "Analyse IA indisponible"}
                </SubmitButton>
              </form>
              <form action={deleteRegistration.bind(null, vehicleId)}>
                <DeleteButton
                  label="Supprimer la photo"
                  confirmMessage="Supprimer la photo de la carte grise ?"
                />
              </form>
            </div>
          )}
          {canManage && !aiEnabled && (
            <p className="text-xs text-gray-400">
              L&apos;analyse automatique nécessite une clé API (ANTHROPIC_API_KEY)
              côté serveur.
            </p>
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

      {/* Aperçu des champs détectés avec validation par case à cocher */}
      {canManage && detected.length > 0 && preview && (
        <form
          action={applyRegistrationFields.bind(null, vehicleId)}
          className="space-y-2 rounded-lg border border-gray-200 p-3"
        >
          <p className="text-sm font-semibold text-gray-700">
            Champs détectés — cochez ceux à appliquer au profil
          </p>
          <div className="divide-y divide-gray-100">
            {detected.map((f) => (
              <label
                key={f.key}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  name="apply"
                  value={f.key}
                  defaultChecked
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="w-44 shrink-0 text-gray-500">{f.label}</span>
                <span className="font-medium text-gray-800">
                  {formatFieldValue(f.key, preview[f.key])}
                </span>
              </label>
            ))}
          </div>
          <SubmitButton className="btn-primary" pendingLabel="Application…">
            Appliquer la sélection au profil
          </SubmitButton>
        </form>
      )}

      {/* Informations déjà enregistrées (lecture seule) */}
      {storedInfo.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-sm font-semibold text-gray-700">
            Informations enregistrées
          </p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {storedInfo.map((info) => (
              <div key={info.label} className="flex justify-between gap-2 text-sm">
                <dt className="text-gray-500">{info.label}</dt>
                <dd className="text-right font-medium text-gray-800">
                  {info.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {canManage ? (
        <form
          action={uploadRegistration.bind(null, vehicleId)}
          className="space-y-2"
        >
          <label className="label">
            {hasImage ? "Remplacer la photo" : "Ajouter une photo"}{" "}
            <span className="font-normal text-gray-400">
              (JPEG, PNG ou WebP, 8 Mo max)
            </span>
          </label>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            className="input"
            required
          />
          <SubmitButton className="btn-secondary" pendingLabel="Envoi…">
            Envoyer la photo
          </SubmitButton>
        </form>
      ) : (
        !hasImage && (
          <p className="text-sm text-gray-400">Aucune carte grise enregistrée.</p>
        )
      )}
    </div>
  );
}
