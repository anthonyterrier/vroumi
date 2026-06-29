"use client";

import { ROLE_LABELS } from "@/lib/labels";

/**
 * Sélecteur de rôle qui soumet automatiquement le formulaire parent (server
 * action) au changement. Server Components ne pouvant pas porter d'`onChange`,
 * ce petit composant client encapsule l'interaction.
 */
export function RoleSelect({
  action,
  defaultValue,
}: {
  action: (formData: FormData) => void;
  defaultValue: string;
}) {
  return (
    <form action={action}>
      <select
        name="role"
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input h-8 w-auto py-0 text-xs"
      >
        {Object.entries(ROLE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </form>
  );
}
