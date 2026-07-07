import { SubmitButton } from "@/components/SubmitButton";
import { VehicleLookup } from "@/components/VehicleLookup";
import {
  FUEL_TYPE_LABELS,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_CATEGORY_ICON,
} from "@/lib/labels";
import { INSPECTION_INTERVAL_OPTIONS } from "@/lib/technical-inspection-fields";
import type { Vehicle } from "@prisma/client";

export function VehicleForm({
  action,
  vehicle,
  submitLabel = "Enregistrer",
}: {
  action: (formData: FormData) => void | Promise<void>;
  vehicle?: Vehicle | null;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Désignation du véhicule *
        </label>
        <input
          id="name"
          name="name"
          className="input"
          required
          defaultValue={vehicle?.name ?? ""}
          placeholder="ex. La Clio"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="category">
            Catégorie
          </label>
          <select
            id="category"
            name="category"
            className="input"
            defaultValue={vehicle?.category ?? "CAR"}
          >
            {Object.entries(VEHICLE_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {VEHICLE_CATEGORY_ICON[k]} {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="usageUnit">
            Compteur
          </label>
          <select
            id="usageUnit"
            name="usageUnit"
            className="input"
            defaultValue={vehicle?.usageUnit ?? "KM"}
          >
            <option value="KM">Kilomètres (km)</option>
            <option value="HOURS">Heures moteur (h)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="make">
            Marque
          </label>
          <input
            id="make"
            name="make"
            className="input"
            defaultValue={vehicle?.make ?? ""}
            placeholder="Renault"
          />
        </div>
        <div>
          <label className="label" htmlFor="model">
            Modèle
          </label>
          <input
            id="model"
            name="model"
            className="input"
            defaultValue={vehicle?.model ?? ""}
            placeholder="Clio IV"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="year">
            Année
          </label>
          <input
            id="year"
            name="year"
            type="number"
            className="input"
            defaultValue={vehicle?.year ?? ""}
            placeholder="2018"
          />
        </div>
        <div>
          <label className="label" htmlFor="fuelType">
            Carburant
          </label>
          <select
            id="fuelType"
            name="fuelType"
            className="input"
            defaultValue={vehicle?.fuelType ?? "GASOLINE"}
          >
            {Object.entries(FUEL_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="plate">
            Immatriculation
          </label>
          <input
            id="plate"
            name="plate"
            className="input"
            defaultValue={vehicle?.plate ?? ""}
            placeholder="AA-123-BB"
          />
        </div>
        <div>
          <label className="label" htmlFor="vin">
            N° de série (VIN)
          </label>
          <input
            id="vin"
            name="vin"
            className="input"
            defaultValue={vehicle?.vin ?? ""}
          />
        </div>
      </div>

      <VehicleLookup />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="initialMileage">
            Compteur initial (km ou h)
          </label>
          <input
            id="initialMileage"
            name="initialMileage"
            type="number"
            className="input"
            defaultValue={vehicle?.initialMileage ?? ""}
            placeholder="120000"
          />
        </div>
        <div>
          <label className="label" htmlFor="tankCapacity">
            Réservoir (L)
          </label>
          <input
            id="tankCapacity"
            name="tankCapacity"
            type="number"
            step="any"
            className="input"
            defaultValue={vehicle?.tankCapacity ?? ""}
            placeholder="45"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="inspectionIntervalMonths">
          Périodicité du contrôle technique
        </label>
        <select
          id="inspectionIntervalMonths"
          name="inspectionIntervalMonths"
          className="input"
          defaultValue={String(vehicle?.inspectionIntervalMonths ?? 24)}
        >
          {INSPECTION_INTERVAL_OPTIONS.map((o) => (
            <option key={o.months} value={o.months}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-gray-400">
          Sert à calculer la date du prochain contrôle après un résultat
          favorable.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="input"
          defaultValue={vehicle?.notes ?? ""}
        />
      </div>

      <SubmitButton className="btn-primary w-full">{submitLabel}</SubmitButton>
    </form>
  );
}
