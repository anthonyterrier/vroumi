import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/** L'analyse IA n'est disponible que si une clé API Anthropic est configurée. */
export const CARTE_GRISE_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

/** Types MIME d'image acceptés pour la photo de la carte grise. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type ImageMediaType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export function isAcceptedImageType(mime: string): mime is ImageMediaType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime);
}

// Champs extraits de la carte grise (certificat d'immatriculation français).
// Tous facultatifs : un champ illisible/absent revient à null.
const ExtractionSchema = z.object({
  make: z.string().nullable(), // D.1 — Marque
  model: z.string().nullable(), // D.3 — Dénomination commerciale
  plate: z.string().nullable(), // A — N° d'immatriculation
  vin: z.string().nullable(), // E — N° d'identification (VIN)
  year: z.number().int().nullable(), // B — année de 1re mise en circulation
  fuelType: z
    .enum(["GASOLINE", "DIESEL", "ELECTRIC", "HYBRID", "LPG", "OTHER"])
    .nullable(), // P.3 — source d'énergie
});

export type CarteGriseFields = z.infer<typeof ExtractionSchema>;

// Schéma JSON équivalent passé à l'API (sortie structurée). La bibliothèque zod
// du projet (v3) n'est pas compatible avec le helper zodOutputFormat du SDK,
// alors on décrit le schéma à la main et on valide la réponse avec zod.
const JSON_SCHEMA: { [key: string]: unknown } = {
  type: "object",
  additionalProperties: false,
  required: ["make", "model", "plate", "vin", "year", "fuelType"],
  properties: {
    make: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    plate: { type: ["string", "null"] },
    vin: { type: ["string", "null"] },
    year: { type: ["integer", "null"] },
    fuelType: {
      type: ["string", "null"],
      enum: ["GASOLINE", "DIESEL", "ELECTRIC", "HYBRID", "LPG", "OTHER", null],
    },
  },
};

const EMPTY: CarteGriseFields = {
  make: null,
  model: null,
  plate: null,
  vin: null,
  year: null,
  fuelType: null,
};

const PROMPT = `Tu analyses la photo d'une carte grise française (certificat d'immatriculation).
Extrais ces champs, en te basant sur les repères normalisés :
- make : marque (repère D.1), ex. "Renault".
- model : dénomination commerciale / modèle (repère D.3), ex. "Clio IV".
- plate : numéro d'immatriculation (repère A), format "AA-123-BB".
- vin : numéro d'identification du véhicule / VIN (repère E), 17 caractères.
- year : année de la première mise en circulation (repère B) — uniquement l'année (entier).
- fuelType : source d'énergie (repère P.3), normalisée parmi GASOLINE (essence/ES), DIESEL (GO/gazole), ELECTRIC (EL), HYBRID (hybride/HE/HH/EE), LPG (GPL/GP), OTHER (autre).
Mets null pour tout champ illisible, absent ou incertain. N'invente aucune valeur.`;

/**
 * Analyse une image de carte grise avec Claude (vision) et renvoie les champs
 * détectés. Lève si la clé API est absente.
 */
export async function extractCarteGrise(
  image: Buffer,
  mimeType: string
): Promise<CarteGriseFields> {
  if (!CARTE_GRISE_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (AUTH/clé API manquante).");
  }
  const mediaType: ImageMediaType = isAcceptedImageType(mimeType)
    ? mimeType
    : "image/jpeg";

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: image.toString("base64"),
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: JSON_SCHEMA } },
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return EMPTY;
  }
  const result = ExtractionSchema.safeParse(parsed);
  return result.success ? result.data : EMPTY;
}
