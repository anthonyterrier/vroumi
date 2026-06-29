"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import {
  uploadRegistration,
  deleteRegistration,
  analyzeRegistration,
  type RegistrationState,
} from "@/app/(app)/vehicles/[id]/registration-actions";

/**
 * Section « Carte grise » (réservée au propriétaire). Envoi/affichage/suppression
 * de la photo + analyse IA qui pré-remplit le profil.
 */
export function CarteGrise({
  vehicleId,
  imageVersion,
  aiEnabled,
  canManage,
}: {
  vehicleId: string;
  imageVersion: number | null;
  aiEnabled: boolean;
  canManage: boolean;
}) {
  const hasImage = imageVersion != null;
  const [state, analyzeAction] = useActionState<RegistrationState, FormData>(
    analyzeRegistration.bind(null, vehicleId),
    undefined
  );

  return (
    <div className="card space-y-4">
      <p className="text-sm text-gray-500">
        Document confidentiel, visible uniquement par le propriétaire du
        véhicule. L&apos;analyse IA lit la photo pour pré-remplir le profil
        (marque, modèle, immatriculation, VIN, année, carburant).
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
            <div className="flex items-center gap-3">
              <form action={analyzeAction}>
                <SubmitButton
                  className="btn-primary"
                  pendingLabel="Analyse en cours…"
                >
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
              L&apos;analyse automatique nécessite la configuration d&apos;une
              clé API (ANTHROPIC_API_KEY) côté serveur.
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
          <p className="text-sm text-gray-400">
            Aucune carte grise enregistrée.
          </p>
        )
      )}
    </div>
  );
}
