"use client";

import { useRef, useState } from "react";

// UUID du service GATT NIIMBOT — requis dans optionalServices pour que le
// navigateur autorise l'accès même en listant « tous les appareils ».
const NIIMBOT_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const DEVICE_ID_KEY = "niimbot.deviceId";
const DEVICE_NAME_KEY = "niimbot.deviceName";

// Sens d'impression : tête sur l'axe largeur ("top", ex. M2) ou hauteur ("left").
export type PrintDirection = "left" | "top";

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
type NiimbotClient = InstanceType<NiimbotModule["NiimbotBluetoothClient"]>;
type BluetoothLike = {
  requestDevice: (opts?: unknown) => Promise<{ id: string; name?: string }>;
  getDevices?: () => Promise<Array<{ id: string; name?: string }>>;
};

// --- Aides canvas (partagées entre étiquettes) -----------------------------

/** Arrondit au multiple de 8 supérieur (chaque dimension doit être multiple de 8). */
export const round8 = (n: number) => Math.max(8, Math.ceil(n / 8) * 8);

/** Découpe un texte en lignes qui tiennent dans maxWidth (coupe aux espaces). */
export function wrapWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(test).width <= maxWidth) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Ajuste la police d'une ligne unique pour tenir dans maxWidth. */
export function fitOneLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFont: number,
  family: string,
  weight = ""
): number {
  for (let font = maxFont; font >= 10; font -= 1) {
    ctx.font = `${weight} ${font}px ${family}`.trim();
    if (ctx.measureText(text).width <= maxWidth) return font;
  }
  return 10;
}

/** Borne le canvas à la largeur de tête d'impression pour ne pas rogner le bord. */
export function clampToHead(
  src: HTMLCanvasElement,
  dir: PrintDirection,
  headPixels: number | undefined
): HTMLCanvasElement {
  if (!headPixels) return src;
  const maxHead = Math.floor(headPixels / 8) * 8;
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

/**
 * Hook d'impression Niimbot : connexion mémorisée (sélecteur pré-filtré sur la
 * dernière imprimante), impression d'un canvas fourni par l'appelant, gestion
 * du statut et reconnexion automatique en cas de coupure.
 */
export function useNiimbotPrinter() {
  const clientRef = useRef<NiimbotClient | null>(null);
  const moduleRef = useRef<NiimbotModule | null>(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function disconnect() {
    try {
      clientRef.current?.disconnect();
    } catch {
      // ignore
    }
    clientRef.current = null;
    moduleRef.current = null;
    setPrinterConnected(false);
  }

  async function connectPrinter(): Promise<NiimbotClient> {
    const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
    const origRequestDevice = bt.requestDevice.bind(bt);
    bt.requestDevice = async () => {
      let savedName = "";
      try {
        savedName = localStorage.getItem(DEVICE_NAME_KEY) || "";
        const saved = localStorage.getItem(DEVICE_ID_KEY);
        if (saved && bt.getDevices) {
          const known = await bt.getDevices();
          const d = known.find((x) => x.id === saved);
          if (d) return d; // reconnexion directe, sans sélecteur
        }
      } catch {
        // getDevices / localStorage indisponible → sélection manuelle.
      }
      let d: { id: string; name?: string } | null = null;
      if (savedName) {
        try {
          d = await origRequestDevice({
            filters: [{ name: savedName }],
            optionalServices: [NIIMBOT_SERVICE],
          });
        } catch {
          d = null;
        }
      }
      if (!d) {
        d = await origRequestDevice({
          acceptAllDevices: true,
          optionalServices: [NIIMBOT_SERVICE],
        });
      }
      try {
        localStorage.setItem(DEVICE_ID_KEY, d.id);
        localStorage.setItem(DEVICE_NAME_KEY, d.name ?? "");
      } catch {
        // stockage indisponible : sans conséquence.
      }
      return d;
    };
    try {
      const niimbot = (await import(
        "@mmote/niimbluelib"
      )) as unknown as NiimbotModule;
      const client = new niimbot.NiimbotBluetoothClient();
      await client.connect();
      clientRef.current = client;
      moduleRef.current = niimbot;
      setPrinterConnected(true);
      return client;
    } finally {
      bt.requestDevice = origRequestDevice;
    }
  }

  async function doPrint(
    client: NiimbotClient,
    niimbot: NiimbotModule,
    buildCanvas: () => Promise<HTMLCanvasElement | null>
  ) {
    const meta = client.getModelMetadata();
    const dir: PrintDirection = meta?.printDirection ?? "top";
    const built = await buildCanvas();
    if (!built) throw new Error("Impossible de générer l'étiquette.");
    const printCanvas = clampToHead(built, dir, meta?.printheadPixels);
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
  }

  /** Imprime le canvas produit par `buildCanvas`. Gère (re)connexion + statut. */
  async function print(buildCanvas: () => Promise<HTMLCanvasElement | null>) {
    if (!("bluetooth" in navigator) || !window.isSecureContext) {
      setStatus(
        "Web Bluetooth indisponible : utilise Chrome/Chromium (PC, Android) ou Bluefy (iOS), et accède au site en HTTPS."
      );
      return;
    }
    try {
      let client = clientRef.current;
      let niimbot = moduleRef.current;
      if (!client || !niimbot) {
        setStatus("Connexion à l'imprimante…");
        client = await connectPrinter();
        niimbot = moduleRef.current!;
      }
      try {
        await doPrint(client, niimbot, buildCanvas);
      } catch {
        // Connexion rompue (imprimante en veille) : on reconnecte et on réessaie.
        disconnect();
        setStatus("Reconnexion à l'imprimante…");
        client = await connectPrinter();
        await doPrint(client, moduleRef.current!, buildCanvas);
      }
      setStatus("Étiquette imprimée ✅");
    } catch (e) {
      disconnect();
      setStatus("Erreur d'impression : " + (e as Error).message);
    }
  }

  return { printerConnected, status, setStatus, print, disconnect };
}
