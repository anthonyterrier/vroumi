"use client";

import { useState } from "react";

function toLocalDate(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/**
 * <input type="date"> pré-rempli, modifiable par l'utilisateur.
 * Par défaut à la date du jour ; si `iso` est fourni (modification d'une
 * entrée), pré-rempli avec cette date. `optional` retire l'attribut required.
 */
export function TodayDateInput({
  name,
  id,
  iso,
  optional = false,
}: {
  name: string;
  id?: string;
  iso?: string;
  optional?: boolean;
}) {
  const [value, setValue] = useState(() =>
    iso ? toLocalDate(new Date(iso)) : optional ? "" : toLocalDate(new Date())
  );
  return (
    <input
      id={id ?? name}
      name={name}
      type="date"
      className="input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      required={!optional}
    />
  );
}
