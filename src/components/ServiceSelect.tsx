"use client";

import { useState } from "react";

export type ServiceOption = {
  id: string;
  name: string;
  brand?: string | null;
  city?: string | null;
};

/**
 * Sélection d'un garage / prestataire dans le catalogue, avec une option
 * « Autre » pour en saisir un nouveau (mémorisé ensuite via upsert).
 */
export function ServiceSelect({
  services,
  defaultValue = "",
  fieldName = "serviceName",
}: {
  services: ServiceOption[];
  defaultValue?: string;
  fieldName?: string;
}) {
  const names = services.map((s) => s.name);
  const startOther = !!defaultValue && !names.includes(defaultValue);

  const [value, setValue] = useState(startOther ? "__other__" : defaultValue);
  const [other, setOther] = useState(startOther);

  return (
    <div className="space-y-2">
      <select
        className="input"
        value={value}
        name={other ? undefined : fieldName}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setOther(v === "__other__");
        }}
      >
        <option value="">— aucun —</option>
        {services.map((s) => (
          <option key={s.id} value={s.name}>
            {s.brand ? `${s.brand} — ${s.name}` : s.name}
            {s.city ? ` (${s.city})` : ""}
          </option>
        ))}
        <option value="__other__">+ Autre / nouveau garage…</option>
      </select>

      {other && (
        <input
          className="input"
          name={fieldName}
          placeholder="Nom du garage / prestataire"
          defaultValue={startOther ? defaultValue : ""}
          autoFocus
        />
      )}
    </div>
  );
}
