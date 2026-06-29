import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ExtractionSchema,
  CARTE_GRISE_FIELDS,
  EMPTY_FIELDS,
  FUEL_VALUES,
  isAcceptedImageType,
  type CarteGriseFields,
} from "@/lib/carte-grise-fields";

/** L'analyse IA n'est disponible que si une clé API Anthropic est configurée. */
export const CARTE_GRISE_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

// Schéma JSON équivalent passé à l'API (sortie structurée). zod v3 du projet
// n'est pas compatible avec le helper zodOutputFormat du SDK : on décrit le
// schéma à la main et on valide la réponse avec zod.
const JSON_SCHEMA: { [key: string]: unknown } = (() => {
  const properties: Record<string, unknown> = {};
  for (const f of CARTE_GRISE_FIELDS) {
    if (f.key === "fuelType") {
      properties[f.key] = { type: ["string", "null"], enum: [...FUEL_VALUES, null] };
    } else if (f.type === "int") {
      properties[f.key] = { type: ["integer", "null"] };
    } else if (f.type === "date") {
      properties[f.key] = {
        type: ["string", "null"],
        description: "Format AAAA-MM-JJ",
      };
    } else {
      properties[f.key] = { type: ["string", "null"] };
    }
  }
  return {
    type: "object",
    additionalProperties: false,
    required: CARTE_GRISE_FIELDS.map((f) => f.key),
    properties,
  };
})();

const PROMPT = `Tu analyses la photo d'une carte grise française (certificat d'immatriculation).
Extrais tous les champs ci-dessous d'après leurs repères normalisés. Mets null pour tout champ illisible, absent ou incertain — n'invente jamais de valeur.
- make : marque (D.1), ex. "Renault".
- model : dénomination commerciale / modèle (D.3).
- vehicleType : type, variante, version (D.2).
- plate : numéro d'immatriculation (A), format "AA-123-BB".
- vin : numéro d'identification / VIN (E), 17 caractères.
- year : année de 1re mise en circulation (B), entier.
- firstRegistrationDate : date de 1re mise en circulation (B), au format AAAA-MM-JJ.
- registrationDate : date du certificat (I), au format AAAA-MM-JJ.
- fuelType : source d'énergie (P.3), normalisée : GASOLINE (essence/ES), DIESEL (GO/gazole), ELECTRIC (EL), HYBRID (hybride/HE/HH/EE/EH), LPG (GPL/GP/GN), OTHER.
- displacementCc : cylindrée (P.1) en cm³, entier.
- powerKw : puissance nette max (P.2) en kW, entier.
- fiscalPower : puissance administrative (P.6) en CV fiscaux, entier.
- seats : nombre de places assises (S.1), entier.
- co2 : émissions de CO2 (V.7) en g/km, entier.
- emissionClass : classe environnementale / norme Euro (V.9).
- massInService : masse en service / poids à vide (G) en kg, entier.
- maxLadenMass : masse en charge max admissible en service (F.2) en kg, entier.
- categoryEu : catégorie du véhicule CE (J).
- nationalType : genre national (J.1), ex. VP, CTTE.
- bodyworkCe : carrosserie CE (J.2).
- bodyworkNational : carrosserie, désignation nationale (J.3).
- typeApprovalNumber : numéro de réception par type (K).
- holderName : nom du titulaire (C.1).
- holderAddress : adresse du titulaire (C.3).`;

/**
 * Analyse une image de carte grise avec Claude (vision) et renvoie les champs
 * détectés. Lève si la clé API est absente.
 */
export async function extractCarteGrise(
  image: Buffer,
  mimeType: string
): Promise<CarteGriseFields> {
  if (!CARTE_GRISE_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }
  const mediaType: ImageMediaType = isAcceptedImageType(mimeType)
    ? mimeType
    : "image/jpeg";

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
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
    return EMPTY_FIELDS;
  }
  const result = ExtractionSchema.safeParse(parsed);
  return result.success ? result.data : EMPTY_FIELDS;
}
