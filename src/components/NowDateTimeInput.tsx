"use client";

import { useState } from "react";

function toLocal(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

/**
 * <input type="datetime-local"> pré-rempli, modifiable par l'utilisateur.
 * Par défaut à l'instant présent (heure locale du navigateur) ; si `iso` est
 * fourni (modification d'une entrée), pré-rempli avec cette date/heure.
 */
export function NowDateTimeInput({
  name,
  id,
  iso,
}: {
  name: string;
  id?: string;
  iso?: string;
}) {
  const [value, setValue] = useState(() =>
    iso ? toLocal(new Date(iso)) : toLocal(new Date())
  );
  return (
    <input
      id={id ?? name}
      name={name}
      type="datetime-local"
      className="input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      required
    />
  );
}
