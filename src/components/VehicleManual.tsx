"use client";

import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { saveManual, deleteManual } from "@/app/(app)/vehicles/[id]/doc-actions";
import { isPdf } from "@/lib/carte-grise-fields";

/**
 * Section « Manuel / notice » : un fichier (PDF) stocké en base OU un lien
 * externe, plus un bouton de recherche pré-rempli (marque + modèle + année).
 */
export function VehicleManual({
  vehicleId,
  fileVersion,
  mimeType,
  url,
  title,
  canManage,
  searchQuery,
}: {
  vehicleId: string;
  fileVersion: number | null;
  mimeType: string | null;
  url: string | null;
  title: string | null;
  canManage: boolean;
  searchQuery: string;
}) {
  const hasFile = fileVersion != null;
  const fileUrl = `/api/vehicles/${vehicleId}/manual?v=${fileVersion}`;
  const searchHref = `https://www.google.com/search?q=${encodeURIComponent(
    searchQuery
  )}`;

  return (
    <div className="card space-y-4">
      <p className="text-sm text-gray-500">
        Le manuel d&apos;utilisation : importe le PDF, ou enregistre un lien vers
        la notice en ligne du constructeur.
      </p>

      {(hasFile || url) && (
        <div className="space-y-2">
          {title && <p className="font-medium">{title}</p>}
          {hasFile ? (
            isPdf(mimeType) ? (
              <div className="space-y-1">
                <iframe
                  title="Manuel du véhicule"
                  src={fileUrl}
                  className="h-96 w-full rounded-lg border border-gray-200"
                />
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline"
                >
                  Ouvrir dans un nouvel onglet
                </a>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={fileUrl}
                alt="Manuel"
                className="max-h-96 w-full rounded-lg border border-gray-200 object-contain"
              />
            )
          ) : (
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-brand-600 hover:underline"
            >
              Ouvrir le manuel ↗
            </a>
          )}
          {canManage && (
            <form action={deleteManual.bind(null, vehicleId)}>
              <DeleteButton
                label="Supprimer le manuel"
                confirmMessage="Supprimer le manuel de ce véhicule ?"
              />
            </form>
          )}
        </div>
      )}

      {canManage && (
        <>
          <a
            href={searchHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-block"
          >
            🔎 Chercher le manuel en ligne
          </a>

          <form action={saveManual.bind(null, vehicleId)} className="space-y-3">
            <div>
              <label className="label">
                Titre{" "}
                <span className="font-normal text-gray-400">(optionnel)</span>
              </label>
              <input
                name="title"
                className="input"
                defaultValue={title ?? ""}
                placeholder="ex. Notice d'utilisation Clio IV"
              />
            </div>
            <div>
              <label className="label">
                Lien vers le manuel{" "}
                <span className="font-normal text-gray-400">(http/https)</span>
              </label>
              <input
                name="url"
                type="url"
                className="input"
                defaultValue={url ?? ""}
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="label">
                …ou importer un fichier{" "}
                <span className="font-normal text-gray-400">
                  (PDF, 25 Mo max)
                </span>
              </label>
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="input"
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Si tu fournis un fichier, il remplace le lien (et inversement).
            </p>
            <SubmitButton className="btn-primary" pendingLabel="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </form>
        </>
      )}

      {!hasFile && !url && !canManage && (
        <p className="text-sm text-gray-400">Aucun manuel enregistré.</p>
      )}
    </div>
  );
}
