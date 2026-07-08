"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  MaintenanceFields,
  type MaintenanceDefaults,
} from "@/components/MaintenanceFields";
import {
  analyzeInvoice,
  type InvoiceScanState,
} from "@/app/(app)/vehicles/[id]/invoice-actions";
import { MAINTENANCE_DISCLAIMER } from "@/lib/maintenance-intervals";

type Service = {
  id: string;
  name: string;
  brand: string | null;
  city: string | null;
};

function toIso(d: string | null | undefined): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

export function AddMaintenanceForm({
  vehicleId,
  services,
  unit,
  action,
  aiEnabled,
}: {
  vehicleId: string;
  services: Service[];
  unit: string;
  action: (formData: FormData) => void | Promise<void>;
  aiEnabled: boolean;
}) {
  const [scanState, scanDispatch, scanPending] = useActionState<
    InvoiceScanState,
    FormData
  >(analyzeInvoice.bind(null, vehicleId), undefined);

  // Remonte les champs (defaultValue) quand une nouvelle extraction arrive.
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (scanState?.extraction) setNonce((n) => n + 1);
  }, [scanState]);

  const ext = scanState?.extraction;
  const defaults: MaintenanceDefaults | undefined = ext
    ? {
        performedAt: toIso(ext.date),
        types: ext.types.length ? ext.types : undefined,
        title: ext.title ?? undefined,
        mileage: ext.mileage,
        cost: ext.cost,
        serviceName: ext.serviceName ?? undefined,
      }
    : undefined;

  return (
    <form action={action} className="space-y-3">
      {aiEnabled && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <label className="label">📄 Scanner une facture (pré-remplissage IA)</label>
          <input
            type="file"
            name="files"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-white file:px-2 file:py-1 file:text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              formAction={scanDispatch}
              disabled={scanPending}
              className="btn-secondary px-3 py-1 text-sm disabled:opacity-60"
            >
              {scanPending ? "Analyse en cours…" : "Analyser la facture"}
            </button>
            <span className="text-[11px] text-gray-500">
              Le fichier choisi sera aussi joint à l&apos;entretien.
            </span>
          </div>
          {scanState?.error && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              {scanState.error}
            </p>
          )}
          {ext && (
            <p className="mt-2 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
              Facture analysée{ext.types.length
                ? ` — ${ext.types.length} opération(s) détectée(s)`
                : ""}. Vérifiez et complétez ci-dessous.
            </p>
          )}
        </div>
      )}

      <MaintenanceFields
        key={nonce}
        services={services}
        unit={unit}
        defaults={defaults}
        allowAttachments={!aiEnabled}
      />

      <p className="text-[11px] text-gray-400">{MAINTENANCE_DISCLAIMER}</p>
      <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
    </form>
  );
}
