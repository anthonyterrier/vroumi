import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Lance `pdftoppm` avec les arguments donnés. Renvoie false si l'outil est
 * absent (ENOENT) ou termine en erreur. */
function runPdftoppm(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("pdftoppm", args);
    } catch {
      resolve(false);
      return;
    }
    let stderr = "";
    child.on("error", () => resolve(false)); // binaire introuvable
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      if (code !== 0 && stderr) console.error("pdftoppm:", stderr.slice(0, 300));
      resolve(code === 0);
    });
  });
}

/**
 * Rasterise un PDF en PNG (une image par page, jusqu'à 5) via `pdftoppm`
 * (poppler-utils). Passe par un fichier temporaire : pdftoppm ne lit pas le PDF
 * depuis stdin de façon fiable selon les versions. Renvoie [] en cas d'échec
 * (outil absent, PDF illisible).
 */
async function rasterizePdf(pdf: Buffer): Promise<Buffer[]> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "vroumi-pdf-"));
    const inPath = join(dir, "in.pdf");
    const outPrefix = join(dir, "page");
    await writeFile(inPath, pdf);
    // -l 5 : au plus 5 pages ; sortie -> page-1.png, page-2.png, …
    const ok = await runPdftoppm(["-png", "-r", "200", "-l", "5", inPath, outPrefix]);
    if (!ok) return [];
    const names = (await readdir(dir))
      .filter((n) => n.startsWith("page") && n.endsWith(".png"))
      .sort();
    const pages: Buffer[] = [];
    for (const n of names) pages.push(await readFile(join(dir, n)));
    return pages;
  } catch {
    return [];
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Remplace chaque PDF de la liste par une (des) image(s) PNG rasterisées, pour
 * que l'IA locale (vision uniquement) puisse les lire. Lève un message clair si
 * `pdftoppm` n'est pas installé (ou si le PDF est illisible).
 */
async function pdfFilesToImages(files: AiFile[]): Promise<AiFile[]> {
  const out: AiFile[] = [];
  for (const f of files) {
    if (!isPdf(f.mimeType)) {
      out.push(f);
      continue;
    }
    const pages = await rasterizePdf(f.buffer);
    if (pages.length === 0) {
      throw new Error(
        "Impossible de convertir le PDF en image pour l'IA locale. Vérifiez que poppler-utils est installé (sudo apt install -y poppler-utils) ou importez une PHOTO du document."
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
