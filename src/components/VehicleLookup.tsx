"use client";

import { useState } from "react";

type Result = {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuelType?: string | null;
  info?: string | null;
  error?: string;
};

function setInput(id: string, value: string | number | null | undefined) {
  if (value == null || value === "") return;
  const el = document.getElementById(id) as
    | HTMLInputElement
    | HTMLSelectElement
    | null;
  if (el) el.value = String(value);
}

/**
 * Boutons de recherche d'infos véhicule (VIN gratuit / plaque payante).
 * Lit les champs #vin et #plate du formulaire et pré-remplit
 * #make, #model, #year, #fuelType à partir de /api/vehicle-lookup.
 */
export function VehicleLookup() {
  const [loading, setLoading] = useState<"vin" | "plate" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function lookup(kind: "vin" | "plate") {
    const field = document.getElementById(kind) as HTMLInputElement | null;
    const value = field?.value.trim();
    if (!value) {
      setMsg({ ok: false, text: kind === "vin" ? "Saisis d'abord le VIN." : "Saisis d'abord la plaque." });
      return;
    }
    setLoading(kind);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/vehicle-lookup?${kind}=${encodeURIComponent(value)}`
      );
      const data: Result = await res.json();
      if (!res.ok || data.error) {
        setMsg({ ok: false, text: data.error || "Recherche impossible." });
        return;
      }
      setInput("make", data.make);
      setInput("model", data.model);
      setInput("year", data.year);
      setInput("fuelType", data.fuelType);
      const filled = [
        data.make && "marque",
        data.model && "modèle",
        data.year && "année",
        data.fuelType && "carburant",
      ].filter(Boolean);
      setMsg({
        ok: true,
        text:
          filled.length > 0
            ? `Pré-rempli : ${filled.join(", ")}${data.info ? ` (${data.info})` : ""}.`
            : "Aucune info exploitable trouvée.",
      });
    } catch {
      setMsg({ ok: false, text: "Erreur réseau pendant la recherche." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-3">
      <p className="mb-2 text-xs text-gray-500">
        Recherche automatique (remplit marque / modèle / année / carburant) :
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => lookup("vin")}
          disabled={loading !== null}
        >
          {loading === "vin" ? "Recherche…" : "🔑 Décoder le VIN"}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => lookup("plate")}
          disabled={loading !== null}
        >
          {loading === "plate" ? "Recherche…" : "🇫🇷 Rechercher par plaque"}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-2 text-xs ${msg.ok ? "text-brand-700" : "text-red-600"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
