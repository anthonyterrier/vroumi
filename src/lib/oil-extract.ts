import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  OilExtractionSchema,
  type OilExtraction,
} from "@/lib/oil-extract-fields";
import { isAcceptedImageType, isPdf } from "@/lib/carte-grise-fields";

/** L'analyse IA n'est disponible que si une clé API Anthropic est configurée. */
export const OIL_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

const PROMPT = `Tu analyses une photo : soit une FACTURE / DEVIS d'entretien automobile (repère la ligne d'huile moteur), soit une PHOTO D'UN BIDON d'huile moteur. Extrait les caractéristiques de l'HUILE MOTEUR et réponds UNIQUEMENT avec un objet JSON (pas de texte, pas de markdown, pas de \`\`\`) :
{
  "brand": "marque / référence commerciale" ou "",   // ex. Castrol Edge, Total Quartz
  "viscosity": "grade de viscosité" ou "",             // ex. 5W30, 0W20, 5W40
  "norm": "normes / homologations constructeur" ou "", // ex. VW 504 00 / 507 00, ACEA C3, API SN, MB 229.51, dexos2
  "quantity": "quantité" ou ""                          // ex. 5 L (contenance du bidon ou quantité facturée)
}
Règles : ne remplis que ce qui est réellement lisible sur l'image ; mets "" si l'info est absente. N'invente rien. Si plusieurs homologations sont listées, sépare-les par « / ». Réponds en français.`;

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toBlock(file: Buffer, mimeType: string): Anthropic.ContentBlockParam {
  const data = file.toString("base64");
  return isPdf(mimeType)
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: isAcceptedImageType(mimeType)
            ? (mimeType as ImageMediaType)
            : "image/jpeg",
          data,
        },
      };
}

/**
 * Extrait les caractéristiques de l'huile (marque, viscosité, normes, quantité)
 * depuis une photo de facture ou de bidon. Lève si la clé API est absente.
 */
export async function extractOilInfo(
  file: Buffer,
  mimeType: string
): Promise<OilExtraction> {
  if (!OIL_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [toBlock(file, mimeType), { type: "text", text: PROMPT }],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJsonObject(text);
  const result = OilExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return { brand: "", viscosity: "", norm: "", quantity: "" };
  }
  return result.data;
}
