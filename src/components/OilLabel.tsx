"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  useNiimbotPrinter,
  round8,
  fitOneLine,
} from "@/components/useNiimbotPrinter";
import { SubmitButton } from "@/components/SubmitButton";
import {
  scanOilInfo,
  type OilScanState,
} from "@/app/(app)/vehicles/[id]/oil-actions";

type OilFields = {
  brand: string;
  viscosity: string;
  norm: string;
  quantity: string;
  note: string;
};

const EMPTY: OilFields = {
  brand: "",
  viscosity: "",
  norm: "",
  quantity: "",
  note: "",
};

/**
 * Étiquette « huile » à imprimer (Niimbot) et coller sur le bidon : indique la
 * référence de l'huile et le véhicule concerné. Les dernières valeurs sont
 * mémorisées par véhicule (localStorage) pour réimprimer facilement.
 */
export function OilLabel({
  vehicleId,
  vehicleName,
  plate,
  aiEnabled,
}: {
  vehicleId: string;
  vehicleName: string;
  plate: string | null;
  aiEnabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { printerConnected, status, setStatus, print, disconnect } =
    useNiimbotPrinter();
  const storeKey = `oil.${vehicleId}`;
  const [f, setF] = useState<OilFields>(EMPTY);
  // Analyse IA d'une photo (facture ou bidon) pour pré-remplir les champs.
  const [scan, scanAction] = useActionState<OilScanState, FormData>(
    scanOilInfo.bind(null, vehicleId),
    undefined
  );
  // Date du jour (figée à l'ouverture) affichée sur l'étiquette.
  const [dateStr] = useState(() => new Date().toLocaleDateString("fr-FR"));

  // Recharge les dernières valeurs saisies pour ce véhicule.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setF({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // stockage indisponible : on part de champs vides.
    }
  }, [storeKey]);

  function update(patch: Partial<OilFields>) {
    setF((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        // sans conséquence
      }
      return next;
    });
  }

  // À chaque nouvelle extraction IA, on pré-remplit les champs trouvés.
  useEffect(() => {
    const x = scan?.fields;
    if (!x) return;
    const patch: Partial<OilFields> = {};
    if (x.brand) patch.brand = x.brand;
    if (x.viscosity) patch.viscosity = x.viscosity;
    if (x.norm) patch.norm = x.norm;
    if (x.quantity) patch.quantity = x.quantity;
    if (Object.keys(patch).length) update(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  const buildLabelCanvas =
    useCallback(async (): Promise<HTMLCanvasElement | null> => {
      const dpi = 300;
      const dotsPerMm = dpi / 25.4;
      const W = round8(50 * dotsPerMm);
      const H = round8(30 * dotsPerMm);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000";
      ctx.textBaseline = "top";

      const pad = round8(0.05 * W);
      const maxW = W - 2 * pad;
      let cy = pad;
      const drawLine = (
        text: string,
        frac: number,
        family: string,
        weight: string
      ) => {
        if (!text) return;
        const fp = fitOneLine(ctx, text, maxW, Math.round(H * frac), family, weight);
        ctx.font = `${weight} ${fp}px ${family}`.trim();
        ctx.fillText(text, pad, cy);
        cy += Math.round(fp * 1.25);
      };

      // Véhicule concerné (en tête).
      const veh = [vehicleName.trim(), plate ? `(${plate})` : ""]
        .filter(Boolean)
        .join(" ");
      drawLine(veh || "Véhicule", 0.13, "sans-serif", "bold");
      cy += Math.round(H * 0.02);
      ctx.fillRect(pad, cy, maxW, 2);
      cy += Math.round(H * 0.04);

      // Huile : marque + viscosité en gros.
      const main = [f.brand.trim(), f.viscosity.trim()].filter(Boolean).join(" ");
      drawLine(main || "Huile", 0.16, "sans-serif", "bold");
      if (f.norm.trim()) drawLine(`Norme : ${f.norm.trim()}`, 0.11, "sans-serif", "");
      const q = [
        f.quantity.trim() ? `Qté : ${f.quantity.trim()}` : "",
        f.note.trim(),
      ]
        .filter(Boolean)
        .join("   ");
      if (q) drawLine(q, 0.1, "sans-serif", "");
      drawLine(`Le ${dateStr}`, 0.085, "sans-serif", "");
      return canvas;
    }, [vehicleName, plate, f, dateStr]);

  // Aperçu WYSIWYG.
  useEffect(() => {
    let cancelled = false;
    buildLabelCanvas().then((off) => {
      if (cancelled || !off) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")?.drawImage(off, 0, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [buildLabelCanvas]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `huile-${vehicleName}.png`;
    a.click();
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-semibold">Étiquette huile (bidon)</h3>
        <p className="text-sm text-gray-500">
          Imprime une étiquette à coller sur le bidon d&apos;huile, indiquant la
          référence de l&apos;huile et le véhicule concerné.
        </p>
      </div>

      {aiEnabled && (
        <form
          action={scanAction}
          className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-2"
        >
          <p className="text-xs text-gray-600">
            📷 Remplis automatiquement les champs depuis une photo de la{" "}
            <strong>facture</strong> d&apos;entretien ou du <strong>bidon</strong>{" "}
            d&apos;huile.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="text-sm"
            />
            <SubmitButton
              className="btn-secondary px-3 py-1 text-sm"
              pendingLabel="Analyse…"
            >
              Analyser (IA)
            </SubmitButton>
          </div>
          {scan?.error && (
            <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-700">
              {scan.error}
            </p>
          )}
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Viscosité</label>
          <input
            className="input"
            placeholder="ex. 5W30"
            value={f.viscosity}
            onChange={(e) => update({ viscosity: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Norme / homologation</label>
          <input
            className="input"
            placeholder="ex. VW 504 00 / 507 00"
            value={f.norm}
            onChange={(e) => update({ norm: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Marque</label>
          <input
            className="input"
            placeholder="ex. Castrol Edge"
            value={f.brand}
            onChange={(e) => update({ brand: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Quantité</label>
          <input
            className="input"
            placeholder="ex. 4,5 L"
            value={f.quantity}
            onChange={(e) => update({ quantity: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Note (facultatif)</label>
          <input
            className="input"
            placeholder="ex. filtre + vidange"
            value={f.note}
            onChange={(e) => update({ note: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <canvas
          ref={canvasRef}
          className="w-full max-w-xs rounded-lg border border-gray-200"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => print(buildLabelCanvas)}
            className="btn-primary"
          >
            🖨️ Imprimer sur Niimbot
          </button>
          <button type="button" onClick={downloadPng} className="btn-secondary">
            Télécharger l&apos;image (PNG)
          </button>
          {printerConnected && (
            <button
              type="button"
              onClick={disconnect}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Imprimante connectée ✓ · déconnecter
            </button>
          )}
        </div>
      </div>

      {status && <p className="text-sm text-gray-600">{status}</p>}
      <p className="text-[11px] text-gray-400">
        Impression via Web Bluetooth (Chrome/Chromium ou Bluefy sur iOS, site en
        HTTPS). Le sens et la largeur sont lus sur le modèle Niimbot connecté ;
        à défaut, télécharge le PNG et imprime-le depuis l&apos;app Niimbot.
      </p>
    </div>
  );
}
