// Métadonnées et validation des champs de carte grise. Module SANS "server-only"
// pour être importable côté client (aperçu/cases à cocher) comme côté serveur.
import { z } from "zod";

/** Types MIME d'image acceptés pour la photo de la carte grise. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isAcceptedImageType(
  mime: string
): mime is (typeof ACCEPTED_IMAGE_TYPES)[number] {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime);
}

/** Types acceptés à l'envoi : images + PDF. */
export const ACCEPTED_UPLOAD_TYPES = [
  ...ACCEPTED_IMAGE_TYPES,
  "application/pdf",
] as const;

export function isAcceptedUploadType(mime: string): boolean {
  return (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(mime);
}

export function isPdf(mime: string | null | undefined): boolean {
  return mime === "application/pdf";
}

export const FUEL_VALUES = [
  "GASOLINE",
  "DIESEL",
  "ELECTRIC",
  "HYBRID",
  "LPG",
  "OTHER",
] as const;

export const ExtractionSchema = z.object({
  make: z.string().nullable(), // D.1
  model: z.string().nullable(), // D.3
  vehicleType: z.string().nullable(), // D.2
  plate: z.string().nullable(), // A
  vin: z.string().nullable(), // E
  year: z.number().int().nullable(), // B (année)
  firstRegistrationDate: z.string().nullable(), // B (AAAA-MM-JJ)
  registrationDate: z.string().nullable(), // I (AAAA-MM-JJ)
  fuelType: z.enum(FUEL_VALUES).nullable(), // P.3
  displacementCc: z.number().int().nullable(), // P.1
  powerKw: z.number().int().nullable(), // P.2
  fiscalPower: z.number().int().nullable(), // P.6
  seats: z.number().int().nullable(), // S.1
  co2: z.number().int().nullable(), // V.7
  emissionClass: z.string().nullable(), // V.9
  massInService: z.number().int().nullable(), // G
  maxLadenMass: z.number().int().nullable(), // F.2
  categoryEu: z.string().nullable(), // J
  nationalType: z.string().nullable(), // J.1
  bodyworkCe: z.string().nullable(), // J.2
  bodyworkNational: z.string().nullable(), // J.3
  typeApprovalNumber: z.string().nullable(), // K
  holderName: z.string().nullable(), // C.1
  holderAddress: z.string().nullable(), // C.3
});

export type CarteGriseFields = z.infer<typeof ExtractionSchema>;
export type CarteGriseFieldKey = keyof CarteGriseFields;
export type CarteGriseFieldType = "string" | "int" | "date" | "fuel";

/** Source unique (libellé + type) pour l'UI et l'application au profil. */
export const CARTE_GRISE_FIELDS: {
  key: CarteGriseFieldKey;
  label: string;
  type: CarteGriseFieldType;
}[] = [
  { key: "make", label: "Marque (D.1)", type: "string" },
  { key: "model", label: "Modèle / dénomination (D.3)", type: "string" },
  { key: "vehicleType", label: "Type, variante, version (D.2)", type: "string" },
  { key: "plate", label: "Immatriculation (A)", type: "string" },
  { key: "vin", label: "N° d'identification / VIN (E)", type: "string" },
  { key: "year", label: "Année (B)", type: "int" },
  {
    key: "firstRegistrationDate",
    label: "1re mise en circulation (B)",
    type: "date",
  },
  { key: "registrationDate", label: "Date du certificat (I)", type: "date" },
  { key: "fuelType", label: "Énergie (P.3)", type: "fuel" },
  { key: "displacementCc", label: "Cylindrée (P.1, cm³)", type: "int" },
  { key: "powerKw", label: "Puissance (P.2, kW)", type: "int" },
  { key: "fiscalPower", label: "Puissance fiscale (P.6, CV)", type: "int" },
  { key: "seats", label: "Places assises (S.1)", type: "int" },
  { key: "co2", label: "Émissions CO₂ (V.7, g/km)", type: "int" },
  {
    key: "emissionClass",
    label: "Classe environnementale (V.9)",
    type: "string",
  },
  { key: "massInService", label: "Masse en service (G, kg)", type: "int" },
  { key: "maxLadenMass", label: "Masse max admissible (F.2, kg)", type: "int" },
  { key: "categoryEu", label: "Catégorie CE (J)", type: "string" },
  { key: "nationalType", label: "Genre national (J.1)", type: "string" },
  { key: "bodyworkCe", label: "Carrosserie CE (J.2)", type: "string" },
  { key: "bodyworkNational", label: "Carrosserie (J.3)", type: "string" },
  { key: "typeApprovalNumber", label: "N° de réception (K)", type: "string" },
  { key: "holderName", label: "Titulaire (C.1)", type: "string" },
  { key: "holderAddress", label: "Adresse (C.3)", type: "string" },
];

export const EMPTY_FIELDS: CarteGriseFields = Object.fromEntries(
  CARTE_GRISE_FIELDS.map((f) => [f.key, null])
) as CarteGriseFields;

const FUEL_LABELS: Record<string, string> = {
  GASOLINE: "Essence",
  DIESEL: "Diesel",
  ELECTRIC: "Électrique",
  HYBRID: "Hybride",
  LPG: "GPL",
  OTHER: "Autre",
};

/** Affichage lisible d'une valeur (dates en JJ/MM/AAAA, énergie en clair). */
export function formatFieldValue(
  key: CarteGriseFieldKey,
  value: unknown
): string {
  if (value == null || value === "") return "—";
  const field = CARTE_GRISE_FIELDS.find((f) => f.key === key);
  if (field?.type === "date") {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("fr-FR");
  }
  if (key === "fuelType") return FUEL_LABELS[String(value)] ?? String(value);
  return String(value);
}

/** Parse la dernière extraction stockée (JSON) en objet validé, ou null. */
export function parseStoredExtraction(
  json: string | null | undefined
): CarteGriseFields | null {
  if (!json) return null;
  try {
    const result = ExtractionSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
