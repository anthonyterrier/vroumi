import { TodayDateInput } from "@/components/TodayDateInput";
import { ServiceSelect } from "@/components/ServiceSelect";
import {
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPE_ICON,
  maintenanceTypeKeys,
  usageUnitLabel,
} from "@/lib/labels";
import type { Maintenance } from "@prisma/client";

/** Valeurs de pré-remplissage (ex. issues d'un scan de facture par IA). */
export type MaintenanceDefaults = {
  performedAt?: string; // ISO
  types?: string[];
  title?: string;
  mileage?: number | null;
  cost?: number | null;
  serviceName?: string;
};

/**
 * Champs partagés des formulaires d'ajout / édition d'entretien. `m` pré-remplit
 * en édition ; `defaults` pré-remplit à partir d'une source externe (scan IA).
 */
export function MaintenanceFields({
  services,
  m,
  unit,
  allowAttachments = false,
  defaults,
}: {
  services: {
    id: string;
    name: string;
    brand: string | null;
    city: string | null;
  }[];
  m?: Maintenance;
  unit: string;
  allowAttachments?: boolean;
  defaults?: MaintenanceDefaults;
}) {
  const checkedKeys =
    defaults?.types && defaults.types.length
      ? defaults.types
      : m
        ? maintenanceTypeKeys(m)
        : ["VIDANGE"];
  const checked = new Set(checkedKeys);

  return (
    <>
      <div>
        <label className="label">Date</label>
        <TodayDateInput
          name="performedAt"
          iso={defaults?.performedAt ?? m?.performedAt.toISOString()}
        />
      </div>
      <div>
        <label className="label">
          Type(s) — cochez tout ce qui a été fait
        </label>
        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-gray-300 p-2">
          {Object.entries(MAINTENANCE_TYPE_LABELS).map(([k, v]) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name="types"
                value={k}
                defaultChecked={checked.has(k)}
              />
              <span>
                {MAINTENANCE_TYPE_ICON[k]} {v}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Précision (optionnel)</label>
        <input
          name="title"
          className="input"
          placeholder="ex. Vidange + filtre à huile"
          defaultValue={defaults?.title ?? m?.title ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Compteur ({usageUnitLabel(unit)})</label>
          <input
            name="mileage"
            type="number"
            className="input"
            defaultValue={defaults?.mileage ?? m?.mileage ?? ""}
          />
        </div>
        <div>
          <label className="label">Coût (€)</label>
          <input
            name="cost"
            type="number"
            step="any"
            className="input"
            defaultValue={defaults?.cost ?? m?.cost ?? ""}
          />
        </div>
      </div>
      <div>
        <label className="label">Garage / prestataire</label>
        <ServiceSelect
          services={services}
          defaultValue={defaults?.serviceName ?? m?.serviceName ?? ""}
        />
      </div>
      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-xs font-medium text-gray-500">
          Prochaine échéance (optionnel — calculée depuis le carnet si vide)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <TodayDateInput
              name="nextDueDate"
              iso={m?.nextDueDate?.toISOString()}
              optional
            />
          </div>
          <div>
            <label className="label">Compteur ({usageUnitLabel(unit)})</label>
            <input
              name="nextDueMileage"
              type="number"
              className="input"
              defaultValue={m?.nextDueMileage ?? ""}
            />
          </div>
        </div>
      </fieldset>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={m?.notes ?? ""} />
      </div>
      {allowAttachments && (
        <div>
          <label className="label">Factures / photos (optionnel)</label>
          <input
            type="file"
            name="files"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-xs"
          />
          <p className="text-[11px] text-gray-400">
            Images ou PDF, 20 Mo max par fichier. Vous pourrez aussi en ajouter
            plus tard sur la fiche de l&apos;entretien.
          </p>
        </div>
      )}
    </>
  );
}
