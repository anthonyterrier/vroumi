"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import {
  enablePublicSharing,
  disablePublicSharing,
  regeneratePublicToken,
} from "@/app/(app)/vehicles/[id]/public-actions";

// UUID du service GATT NIIMBOT — requis dans optionalServices pour que le
// navigateur autorise l'accès, même quand on liste « tous les appareils ».
const NIIMBOT_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const DEVICE_ID_KEY = "niimbot.deviceId";

// Sens d'impression : la tête est sur l'axe largeur ("top", ex. M2) ou hauteur
// ("left"). On NE force PAS de valeur : on lit getModelMetadata() du modèle réel.
type PrintDirection = "left" | "top";

// Interface minimale de @mmote/niimbluelib (lib alpha) — découplée de ses types.
type NiimbotModule = {
  NiimbotBluetoothClient: new () => {
    connect: () => Promise<unknown>;
    disconnect: () => void;
    getPrintTaskType: () => string | undefined;
    getModelMetadata: () =>
      | { printDirection?: PrintDirection; printheadPixels?: number }
      | undefined;
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
    encodeCanvas: (canvas: HTMLCanvasElement, dir: PrintDirection) => unknown;
  };
};

// Interface minimale de navigator.bluetooth (types Web Bluetooth absents de TS).
type BluetoothLike = {
  requestDevice: (opts?: unknown) => Promise<{ id: string }>;
  getDevices?: () => Promise<Array<{ id: string }>>;
};

// Arrondit au multiple de 8 supérieur : chaque dimension du canvas doit être un
// multiple de 8 (8 px = 1 octet), sinon « Column count must be multiple of 8 ».
const round8 = (n: number) => Math.max(8, Math.ceil(n / 8) * 8);

// Découpe un texte en lignes qui tiennent dans maxWidth (coupe aux espaces).
function wrapWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Ajuste la police pour que le texte tienne dans maxWidth sur au plus maxLines
// lignes : on réduit la taille jusqu'à ce que chaque ligne rentre.
function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFont: number,
  family: string,
  weight: string,
  maxLines: number
): { fontPx: number; lines: string[] } {
  for (let font = maxFont; font >= 12; font -= 2) {
    ctx.font = `${weight} ${font}px ${family}`.trim();
    const lines = wrapWords(ctx, text, maxWidth);
    if (
      lines.length <= maxLines &&
      lines.every((l) => ctx.measureText(l).width <= maxWidth)
    ) {
      return { fontPx: font, lines };
    }
  }
  ctx.font = `${weight} 12px ${family}`.trim();
  return { fontPx: 12, lines: wrapWords(ctx, text, maxWidth).slice(0, maxLines) };
}

// Ajuste la police d'une ligne unique (sans retour) pour tenir dans maxWidth.
function fitOneLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFont: number,
  family: string
): number {
  for (let font = maxFont; font >= 10; font -= 1) {
    ctx.font = `${font}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return font;
  }
  return 10;
}

// Borne le canvas à la largeur de tête d'impression (printheadPixels) pour ne
// pas rogner le bord. En "top" l'axe tête = largeur ; en "left" = hauteur.
function clampToHead(
  src: HTMLCanvasElement,
  dir: PrintDirection,
  headPixels: number | undefined
): HTMLCanvasElement {
  if (!headPixels) return src;
  const maxHead = Math.floor(headPixels / 8) * 8; // multiple de 8
  const headIsWidth = dir !== "left";
  const axis = headIsWidth ? src.width : src.height;
  if (axis <= maxHead) return src;
  const s = maxHead / axis;
  const r8 = (n: number) => Math.max(8, Math.round(n / 8) * 8);
  const nc = document.createElement("canvas");
  nc.width = headIsWidth ? maxHead : r8(src.width * s);
  nc.height = headIsWidth ? r8(src.height * s) : maxHead;
  const c = nc.getContext("2d");
  if (c) {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, nc.width, nc.height);
    c.drawImage(src, 0, 0, nc.width, nc.height);
  }
  return nc;
}

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

  // Construit l'étiquette (QR + nom + plaque) sur un canvas hors-écran.
  // Étiquette ~50×30 mm à 300 dpi (la M2 est en 300 dpi, pas 203) : on calcule
  // mm × dpi/25.4, dimensions ramenées à un multiple de 8.
  const buildLabelCanvas =
    useCallback(async (): Promise<HTMLCanvasElement | null> => {
      if (!publicUrl) return null;
      const dpi = 300;
      const dotsPerMm = dpi / 25.4; // 300 dpi → 11.81
      const W = round8(50 * dotsPerMm);
      const H = round8(30 * dotsPerMm);

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);

      const pad = round8(0.07 * H);
      const qrSize = Math.floor((H - 2 * pad) / 8) * 8;
      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, publicUrl, { width: qrSize, margin: 0 });
      ctx.drawImage(qrCanvas, pad, (H - qrSize) / 2, qrSize, qrSize);

      // Colonne de texte à droite du QR : on ajuste tout pour tenir dans sa
      // largeur (sinon les noms longs débordaient et étaient coupés).
      const tx = pad + qrSize + pad;
      const maxTextW = W - tx - pad;
      ctx.fillStyle = "#000";
      ctx.textBaseline = "top";
      let cy = pad;

      // Nom : jusqu'à 2 lignes, police réduite au besoin.
      const name = vehicleName.trim();
      const nameFit = fitLines(
        ctx,
        name,
        maxTextW,
        Math.round(H * 0.15),
        "sans-serif",
        "bold",
        2
      );
      ctx.font = `bold ${nameFit.fontPx}px sans-serif`;
      const nameLH = Math.round(nameFit.fontPx * 1.12);
      for (const line of nameFit.lines) {
        ctx.fillText(line, tx, cy);
        cy += nameLH;
      }
      cy += Math.round(H * 0.05);

      // Plaque : une seule ligne, police réduite pour tenir en largeur.
      if (plate) {
        const plateFont = fitOneLine(
          ctx,
          plate,
          maxTextW,
          Math.round(H * 0.11),
          "monospace"
        );
        ctx.font = `${plateFont}px monospace`;
        ctx.fillText(plate, tx, cy);
        cy += Math.round(plateFont * 1.15) + Math.round(H * 0.05);
      }

      const small = Math.round(H * 0.075);
      ctx.font = `${small}px sans-serif`;
      ctx.fillText("Historique", tx, cy);
      ctx.fillText("d'entretien", tx, cy + Math.round(small * 1.2));
      return canvas;
    }, [publicUrl, vehicleName, plate]);

  // Aperçu WYSIWYG : on recopie le canvas construit dans le canvas visible.
  useEffect(() => {
    let cancelled = false;
    buildLabelCanvas()
      .then((off) => {
        if (cancelled || !off) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
      })
      .catch(() => setStatus("Impossible de générer le QR."));
    return () => {
      cancelled = true;
    };
  }, [buildLabelCanvas]);

  async function printNiimbot() {
    if (!("bluetooth" in navigator) || !window.isSecureContext) {
      setStatus(
        "Web Bluetooth indisponible : utilise Chrome/Chromium (PC, Android) ou Bluefy (iOS), et accède au site en HTTPS."
      );
      return;
    }
    setStatus("Connexion à l'imprimante…");

    const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
    const origRequestDevice = bt.requestDevice.bind(bt);
    // On surcharge requestDevice le temps du connect() : les filtres de
    // niimbluelib ne remontent pas la M2 (iOS/Bluefy surtout). On liste TOUT,
    // et on mémorise l'appareil choisi pour les fois suivantes.
    bt.requestDevice = async () => {
      try {
        const saved = localStorage.getItem(DEVICE_ID_KEY);
        if (saved && bt.getDevices) {
          const known = await bt.getDevices();
          const d = known.find((x) => x.id === saved);
          if (d) return d; // reconnexion directe, sans sélecteur
        }
      } catch {
        // localStorage / getDevices indisponible → on retombe sur la liste.
      }
      const d = await origRequestDevice({
        acceptAllDevices: true,
        optionalServices: [NIIMBOT_SERVICE],
      });
      try {
        localStorage.setItem(DEVICE_ID_KEY, d.id);
      } catch {
        // stockage indisponible : sans conséquence, on redemandera la liste.
      }
      return d;
    };

    try {
      const niimbot = (await import(
        "@mmote/niimbluelib"
      )) as unknown as NiimbotModule;
      const client = new niimbot.NiimbotBluetoothClient();
      try {
        await client.connect();
      } finally {
        bt.requestDevice = origRequestDevice; // toujours restaurer
      }

      // Sens et largeur de tête lus sur le modèle réellement connecté.
      const meta = client.getModelMetadata();
      const dir: PrintDirection = meta?.printDirection ?? "top";
      const headPixels = meta?.printheadPixels;

      const built = await buildLabelCanvas();
      if (!built) {
        setStatus("Impossible de générer l'étiquette.");
        client.disconnect();
        return;
      }
      const printCanvas = clampToHead(built, dir, headPixels);
      const encoded = niimbot.ImageEncoder.encodeCanvas(printCanvas, dir);
      const taskName = client.getPrintTaskType() ?? "B1";

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
      bt.requestDevice = origRequestDevice; // sécurité si erreur avant le finally
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
        Impression directe via Web Bluetooth : Chrome/Chromium (PC, Android) ou
        Bluefy (iOS), site en HTTPS. Le sens et la largeur d&apos;impression sont
        lus sur le modèle Niimbot connecté ; à défaut, télécharge le PNG et
        imprime-le depuis l&apos;app Niimbot.
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
