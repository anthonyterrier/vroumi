import "server-only";
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { isAcceptedImageType, isPdf } from "@/lib/carte-grise-fields";

// --- Choix du fournisseur IA ------------------------------------------------
//
// Par défaut : Claude (Anthropic). Si LOCAL_AI_BASE_URL est renseigné dans le
// `.env`, TOUTES les fonctions IA (vision/texte, base de connaissances,
// procédure de réinitialisation) appellent une IA locale compatible OpenAI
// (Ollama, LM Studio…) au lieu de Claude. Nuance : avec Claude, la base de
// connaissances et la réinit utilisent la RECHERCHE WEB (sources à l'appui) ;
// avec une IA locale (sans accès web), la réponse provient des connaissances
// du modèle. Les PDF sont rasterisés en image pour l'IA locale (pdftoppm).
//
// Variables .env :
//   LOCAL_AI_BASE_URL   ex. http://192.168.1.50:11434/v1   (Ollama, avec /v1)
//   LOCAL_AI_MODEL      modèle VISION (scans photo)         ex. llama3.2-vision:11b
//   LOCAL_AI_TEXT_MODEL modèle TEXTE (optionnel, diag OBD)  ex. qwen2.5:14b
//   LOCAL_AI_API_KEY    optionnel (Ollama l'ignore)          défaut "ollama"

export const LOCAL_AI_BASE_URL = (process.env.LOCAL_AI_BASE_URL || "").replace(
  /\/+$/,
  ""
);
export const LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL || "";
const LOCAL_AI_TEXT_MODEL = process.env.LOCAL_AI_TEXT_MODEL || "";
const ANTHROPIC_ENABLED = !!process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-haiku-4-5";

/** IA locale utilisable (URL + modèle vision configurés). */
export const LOCAL_AI_ENABLED = !!LOCAL_AI_BASE_URL && !!LOCAL_AI_MODEL;

/** Fonctions vision/texte : dispo si IA locale OU clé Anthropic. */
export const AI_ENABLED = LOCAL_AI_ENABLED || ANTHROPIC_ENABLED;

/** Fonctions de recherche web : Claude uniquement. */
export const WEB_AI_ENABLED = ANTHROPIC_ENABLED;

export type AiFile = { buffer: Buffer; mimeType: string };
type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Complétion IA générique : un prompt + éventuellement des fichiers (images ou
 * PDF), renvoie le texte produit. Route vers l'IA locale si configurée, sinon
 * Claude.
 */
export async function aiComplete(opts: {
  prompt: string;
  files?: AiFile[];
  maxTokens?: number;
}): Promise<string> {
  const { prompt, files = [], maxTokens = 2048 } = opts;
  if (LOCAL_AI_ENABLED) return localComplete(prompt, files, maxTokens);
  if (ANTHROPIC_ENABLED) return anthropicComplete(prompt, files, maxTokens);
  throw new Error("Aucun fournisseur IA configuré (ni IA locale, ni clé Anthropic).");
}

async function anthropicComplete(
  prompt: string,
  files: AiFile[],
  maxTokens: number
): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = files.map((f) => {
    const data = f.buffer.toString("base64");
    return isPdf(f.mimeType)
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: isAcceptedImageType(f.mimeType)
              ? (f.mimeType as ImageMediaType)
              : "image/jpeg",
            data,
          },
        };
  });
  content.push({ type: "text", text: prompt });

  const client = new Anthropic();
  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Convertit une page de PDF en PNG via `pdftoppm` (poppler-utils), en lisant le
 * PDF sur stdin et en récupérant le PNG sur stdout. Renvoie null si l'outil est
 * absent ou si la page n'existe pas (fin du document).
 */
function rasterizePdfPage(pdf: Buffer, page: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let child;
    try {
      // -singlefile + sortie « - » => écrit le PNG sur stdout.
      child = spawn("pdftoppm", [
        "-png",
        "-singlefile",
        "-r",
        "200",
        "-f",
        String(page),
        "-l",
        String(page),
        "-",
        "-",
      ]);
    } catch {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let failed = false;
    child.on("error", () => {
      // Binaire introuvable (ENOENT) ou non exécutable.
      failed = true;
      resolve(null);
    });
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("close", (code) => {
      if (failed) return;
      const out = Buffer.concat(chunks);
      resolve(code === 0 && out.length > 0 ? out : null);
    });
    child.stdin.on("error", () => {}); // évite EPIPE si le process meurt tôt
    child.stdin.end(pdf);
  });
}

/**
 * Remplace chaque PDF de la liste par une (des) image(s) PNG rasterisées, pour
 * que l'IA locale (vision uniquement) puisse les lire. Rasterise jusqu'à 5
 * pages. Lève un message clair si `pdftoppm` n'est pas installé sur le serveur.
 */
async function pdfFilesToImages(files: AiFile[]): Promise<AiFile[]> {
  const out: AiFile[] = [];
  for (const f of files) {
    if (!isPdf(f.mimeType)) {
      out.push(f);
      continue;
    }
    const pages: Buffer[] = [];
    for (let p = 1; p <= 5; p++) {
      const png = await rasterizePdfPage(f.buffer, p);
      if (!png) break;
      pages.push(png);
    }
    if (pages.length === 0) {
      throw new Error(
        "Impossible de convertir le PDF en image pour l'IA locale. Installez poppler-utils sur le serveur (sudo apt install -y poppler-utils) ou importez une PHOTO du document."
      );
    }
    for (const png of pages) out.push({ buffer: png, mimeType: "image/png" });
  }
  return out;
}

// API compatible OpenAI (Ollama : POST {base}/chat/completions).
async function localComplete(
  prompt: string,
  rawFiles: AiFile[],
  maxTokens: number
): Promise<string> {
  // L'IA locale ne lit que des images : on rasterise les PDF en PNG.
  const files = await pdfFilesToImages(rawFiles);
  const hasImages = files.length > 0;
  // Modèle vision pour les images ; modèle texte dédié sinon (s'il existe).
  const model =
    hasImages || !LOCAL_AI_TEXT_MODEL ? LOCAL_AI_MODEL : LOCAL_AI_TEXT_MODEL;

  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const f of files) {
    const mt = isAcceptedImageType(f.mimeType) ? f.mimeType : "image/jpeg";
    content.push({
      type: "image_url",
      image_url: { url: `data:${mt};base64,${f.buffer.toString("base64")}` },
    });
  }

  const res = await fetch(`${LOCAL_AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LOCAL_AI_API_KEY || "ollama"}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
    // Un modèle local peut être lent (surtout en vision) : marge large.
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`IA locale (${res.status}) : ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}
