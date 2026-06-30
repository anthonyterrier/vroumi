"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import {
  enablePublicSharing,
  disablePublicSharing,
  regeneratePublicToken,
} from "@/app/(app)/vehicles/[id]/public-actions";

// Interface minimale de @mmote/niimbluelib (lib alpha) — découplée de ses types.
type NiimbotModule = {
  NiimbotBluetoothClient: new () => {
    connect: () => Promise<unknown>;
    disconnect: () => void;
    getPrintTaskType: () => string | undefined;
    abstraction: {
      newPrintTask: (
        name: string,
        opts: {
          totalPages: number;
          statusPollIntervalMs?: number;
          statusTimeoutMs?: number;
        }
      ) => {
        printInit: () => Promise<unknown>;
        printPage: (img: unknown, qty: number) => Promise<unknown>;
        waitForPageFinished: () => Promise<unknown>;
        waitForFinished: () => Promise<unknown>;
        printEnd: () => Promise<unknown>;
      };
    };
  };
  ImageEncoder: {
    encodeCanvas: (canvas: HTMLCanvasElement, dir: "left" | "top") => unknown;
  };
};

export function QrLabel({
  vehicleId,
  publicUrl,
  vehicleName,
  plate,
  canManage,
}: {
  vehicleId: string;
  publicUrl: string | null;
  vehicleName: string;
  plate: string | null;
  canManage: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Dessine l'étiquette (QR + nom + plaque) sur le canvas (~50×30 mm @ 8 pts/mm).
  useEffect(() => {
    if (!publicUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 400;
    const H = 240;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    const qrSize = 208;
    const qrCanvas = document.createElement("canvas");
    QRCode.toCanvas(qrCanvas, publicUrl, { width: qrSize, margin: 0 })
      .then(() => {
        ctx.drawImage(qrCanvas, 12, (H - qrSize) / 2, qrSize, qrSize);
        ctx.fillStyle = "#000";
        ctx.font = "bold 26px sans-serif";
        ctx.fillText(vehicleName.slice(0, 16), qrSize + 28, 78);
        let y = 78;
        if (plate) {
          ctx.font = "22px monospace";
          y += 34;
          ctx.fillText(plate, qrSize + 28, y);
        }
        ctx.font = "15px sans-serif";
        ctx.fillText("Historique", qrSize + 28, y + 36);
        ctx.fillText("d'entretien", qrSize + 28, y + 56);
      })
      .catch(() => setStatus("Impossible de générer le QR."));
  }, [publicUrl, vehicleName, plate]);

  async function printNiimbot() {
    const hasBluetooth = "bluetooth" in navigator;
    if (!hasBluetooth || !window.isSecureContext) {
      setStatus(
        "Web Bluetooth indisponible : utilise Chrome/Edge et accède au site en HTTPS."
      );
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("Connexion à l'imprimante…");
    try {
      const niimbot = (await import(
        "@mmote/niimbluelib"
      )) as unknown as NiimbotModule;
      const client = new niimbot.NiimbotBluetoothClient();
      await client.connect();
      const taskName = client.getPrintTaskType() ?? "B1";
      const encoded = niimbot.ImageEncoder.encodeCanvas(canvas, "left");
      const task = client.abstraction.newPrintTask(taskName, {
        totalPages: 1,
        statusPollIntervalMs: 100,
        statusTimeoutMs: 8000,
      });
      setStatus("Impression…");
      await task.printInit();
      await task.printPage(encoded, 1);
      await task.waitForPageFinished();
      await task.waitForFinished();
      await task.printEnd();
      client.disconnect();
      setStatus("Étiquette imprimée ✅");
    } catch (e) {
      setStatus("Erreur d'impression : " + (e as Error).message);
    }
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${vehicleName}.png`;
    a.click();
  }

  if (!publicUrl) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-gray-500">
          Active le partage public pour générer un QR code (à coller sur la
          voiture) qui ouvre une page en lecture seule avec l&apos;historique
          d&apos;entretien — entretiens et réparations uniquement, sans les
          coûts.
        </p>
        {canManage && (
          <form action={enablePublicSharing.bind(null, vehicleId)}>
            <SubmitButton className="btn-primary" pendingLabel="…">
              Activer le partage public
            </SubmitButton>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <p className="text-sm text-gray-500">
        Page publique (lecture seule) : entretiens et réparations. Toute personne
        ayant le QR / le lien peut la consulter sans se connecter.
      </p>

      <div className="flex items-center gap-2">
        <input readOnly value={publicUrl} className="input text-xs" />
        <CopyButton value={publicUrl} className="btn-secondary shrink-0" />
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary shrink-0"
        >
          Ouvrir
        </a>
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <canvas
          ref={canvasRef}
          className="w-full max-w-xs rounded-lg border border-gray-200"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={printNiimbot}
            className="btn-primary"
          >
            🖨️ Imprimer sur Niimbot
          </button>
          <button
            type="button"
            onClick={downloadPng}
            className="btn-secondary"
          >
            Télécharger l&apos;image (PNG)
          </button>
        </div>
      </div>

      {status && <p className="text-sm text-gray-600">{status}</p>}
      <p className="text-[11px] text-gray-400">
        Impression directe via Web Bluetooth (Chrome/Edge, site en HTTPS). La
        taille d&apos;étiquette dépend du modèle Niimbot ; à défaut, télécharge
        le PNG et imprime-le depuis l&apos;app Niimbot.
      </p>

      {canManage && (
        <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-sm">
          <form action={regeneratePublicToken.bind(null, vehicleId)}>
            <SubmitButton
              className="text-brand-600 hover:underline"
              pendingLabel="…"
            >
              Régénérer le QR (révoque l&apos;ancien)
            </SubmitButton>
          </form>
          <form action={disablePublicSharing.bind(null, vehicleId)}>
            <SubmitButton
              className="text-red-600 hover:underline"
              pendingLabel="…"
            >
              Désactiver le partage
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
