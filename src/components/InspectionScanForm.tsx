"use client";

import { useActionState, useRef, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  scanInspection,
  type InspectionState,
} from "@/app/(app)/vehicles/[id]/inspection-actions";

const MAX_MB = 20;

export function InspectionScanForm({ vehicleId }: { vehicleId: string }) {
  const action = scanInspection.bind(null, vehicleId);
  const [state, formAction] = useActionState<InspectionState, FormData>(
    action,
    undefined
  );
  const [tooBig, setTooBig] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-gray-600">
        Scanne le compte rendu du contrôle technique (photo ou PDF) : l&apos;IA
        en extrait la date, le résultat et la liste des défaillances à traiter.
      </p>
      <input
        ref={ref}
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setTooBig(!!f && f.size > MAX_MB * 1024 * 1024);
        }}
        className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-xs"
      />
      {tooBig && (
        <p className="text-[11px] text-red-600">
          Fichier trop lourd (max {MAX_MB} Mo).
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
      <SubmitButton className="btn-primary" pendingLabel="Analyse en cours…">
        Analyser le compte rendu
      </SubmitButton>
    </form>
  );
}
