"use client";

import { useTransition } from "react";
import { toggleDefect } from "@/app/(app)/vehicles/[id]/inspection-actions";

/** Case « réparé » d'une défaillance de contrôle technique. */
export function DefectToggle({
  vehicleId,
  defectId,
  fixed,
  canEdit,
}: {
  vehicleId: string;
  defectId: string;
  fixed: boolean;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={`flex cursor-pointer items-center gap-1.5 text-xs ${
        canEdit ? "" : "pointer-events-none opacity-70"
      }`}
    >
      <input
        type="checkbox"
        checked={fixed}
        disabled={!canEdit || pending}
        onChange={() =>
          startTransition(() => {
            toggleDefect(vehicleId, defectId);
          })
        }
      />
      <span className={fixed ? "text-green-700" : "text-gray-500"}>
        {fixed ? "réparé" : "à faire"}
      </span>
    </label>
  );
}
