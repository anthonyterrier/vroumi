// Libellés français pour les énumérations et utilitaires d'affichage.

export const VEHICLE_CATEGORY_LABELS: Record<string, string> = {
  CAR: "Voiture",
  MOTORCYCLE: "Moto / scooter",
  VAN: "Utilitaire / fourgon",
  TRUCK: "Camion / poids lourd",
  TRACTOR: "Tracteur",
  AGRICULTURAL: "Engin agricole",
  OTHER: "Autre",
};

export const VEHICLE_CATEGORY_ICON: Record<string, string> = {
  CAR: "🚗",
  MOTORCYCLE: "🏍️",
  VAN: "🚐",
  TRUCK: "🚚",
  TRACTOR: "🚜",
  AGRICULTURAL: "🚜",
  OTHER: "🔧",
};

/** Unité d'usage par défaut suggérée selon la catégorie. */
export function defaultUsageUnit(category: string): "KM" | "HOURS" {
  return category === "TRACTOR" || category === "AGRICULTURAL" ? "HOURS" : "KM";
}

/** Libellé court de l'unité d'usage d'un véhicule : "km" ou "h". */
export function usageUnitLabel(unit: string | null | undefined): string {
  return unit === "HOURS" ? "h" : "km";
}

export const FUEL_TYPE_LABELS: Record<string, string> = {
  GASOLINE: "Essence",
  DIESEL: "Diesel",
  ELECTRIC: "Électrique",
  HYBRID: "Hybride",
  LPG: "GPL",
  OTHER: "Autre",
};

export const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  VIDANGE: "Vidange (huile moteur)",
  FILTRE_HUILE: "Filtre à huile",
  FILTRE_AIR: "Filtre à air",
  FILTRE_HABITACLE: "Filtre habitacle",
  FILTRE_CARBURANT: "Filtre à carburant",
  FREINS: "Freins (plaquettes / disques)",
  LIQUIDE_DE_FREIN: "Liquide de frein (purge)",
  PNEUS: "Pneumatiques",
  COURROIE_DISTRIBUTION: "Courroie de distribution",
  COURROIE_ACCESSOIRE: "Courroie d'accessoires",
  BOUGIES: "Bougies",
  BATTERIE: "Batterie",
  AMORTISSEURS: "Amortisseurs / suspension",
  ECHAPPEMENT: "Échappement",
  CLIMATISATION: "Climatisation",
  LIQUIDE_REFROIDISSEMENT: "Liquide de refroidissement",
  ESSUIE_GLACE: "Essuie-glaces",
  REVISION: "Révision générale",
  LAVAGE_EXTERIEUR: "Lavage extérieur",
  LAVAGE_INTERIEUR: "Lavage intérieur",
  LAVAGE_SIEGES: "Nettoyage des sièges",
  NETTOYAGE_JANTES: "Nettoyage des jantes",
  POLISSAGE: "Polissage / lustrage",
  DESINFECTION: "Désinfection habitacle",
  AUTRE: "Autre",
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ASSURANCE: "Assurance",
  CONTROLE_TECHNIQUE: "Contrôle technique",
  CARTE_GRISE: "Carte grise",
  VIGNETTE_CRITAIR: "Vignette Crit'Air",
  GARANTIE: "Garantie",
  AUTRE: "Autre",
};

export const REMINDER_KIND_LABELS: Record<string, string> = {
  MAINTENANCE: "Entretien",
  CONTROLE_TECHNIQUE: "Contrôle technique",
  ASSURANCE: "Assurance",
  DOCUMENT: "Document",
  OTHER: "Autre",
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  DRIVER: "Conducteur / Famille",
  VIEWER: "Lecture seule",
};

/** Courte description du rôle (affichée dans l'éditeur de droits). */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: "Accès complet et gestion des membres.",
  DRIVER: "Vision d'ensemble et saisie, hors finances et gestion des membres.",
  VIEWER: "Lecture seule de l'essentiel.",
};

/** Libellés des fonctionnalités CRUD pour l'éditeur de droits. */
export const PERM_FEATURE_LABELS: Record<string, string> = {
  vehicles: "Véhicules",
  maintenance: "Entretiens",
  repairs: "Réparations",
  fuel: "Carburant",
  mileage: "Kilométrage",
  documents: "Documents",
  reminders: "Rappels",
};

/** Libellés des actions CRUD. */
export const PERM_ACTION_LABELS: Record<string, string> = {
  View: "Voir",
  Add: "Ajouter",
  Edit: "Modifier",
  Delete: "Supprimer",
};

/** Libellés des droits « module » (action unique). */
export const PERM_MODULE_LABELS: Record<string, string> = {
  costsView: "Voir la synthèse des coûts (finances)",
  membersManage: "Gérer les membres du garage",
  catalogManage: "Gérer le catalogue des prestataires",
  registrationView: "Voir la carte grise (propriétaire)",
  registrationManage: "Gérer la carte grise (photo + analyse IA)",
};

/** Suffixe d'action d'une clé CRUD : "maintenanceEdit" → "Edit". */
export function permActionLabel(key: string): string {
  const action = ["View", "Add", "Edit", "Delete"].find((a) =>
    key.endsWith(a)
  );
  return action ? PERM_ACTION_LABELS[action] : key;
}

/** Pictogramme associé à un type d'entretien (affichage compact). */
export const MAINTENANCE_TYPE_ICON: Record<string, string> = {
  VIDANGE: "🛢️",
  FILTRE_HUILE: "🛢️",
  FILTRE_AIR: "🌬️",
  FILTRE_HABITACLE: "🌬️",
  FILTRE_CARBURANT: "⛽",
  FREINS: "🛑",
  LIQUIDE_DE_FREIN: "💧",
  PNEUS: "🛞",
  COURROIE_DISTRIBUTION: "⚙️",
  COURROIE_ACCESSOIRE: "⚙️",
  BOUGIES: "⚡",
  BATTERIE: "🔋",
  AMORTISSEURS: "🪛",
  ECHAPPEMENT: "💨",
  CLIMATISATION: "❄️",
  LIQUIDE_REFROIDISSEMENT: "🌡️",
  ESSUIE_GLACE: "🌧️",
  REVISION: "🔧",
  LAVAGE_EXTERIEUR: "🚿",
  LAVAGE_INTERIEUR: "🧹",
  LAVAGE_SIEGES: "💺",
  NETTOYAGE_JANTES: "✨",
  POLISSAGE: "🪞",
  DESINFECTION: "🧼",
  AUTRE: "🔧",
};

/** Liste des clés de type d'un entretien (multi-sélection via `types`, repli sur `type`). */
export function maintenanceTypeKeys(m: {
  type: string;
  types?: string | null;
}): string[] {
  const raw =
    m.types && m.types.trim() ? m.types.split(",").map((s) => s.trim()) : [];
  const keys = raw.filter((k) => k in MAINTENANCE_TYPE_LABELS);
  return keys.length > 0 ? keys : [m.type];
}

/** Libellé lisible des types d'un entretien : "Vidange, Filtre à huile". */
export function maintenanceTypeLabel(m: {
  type: string;
  types?: string | null;
}): string {
  return maintenanceTypeKeys(m)
    .map((k) => MAINTENANCE_TYPE_LABELS[k] ?? k)
    .join(", ");
}

export type DueStatus = "ok" | "soon" | "overdue" | "unknown";

export const DUE_STATUS_STYLE: Record<
  DueStatus,
  { label: string; className: string }
> = {
  ok: { label: "À jour", className: "bg-green-100 text-green-800 border-green-200" },
  soon: { label: "Bientôt", className: "bg-amber-100 text-amber-800 border-amber-200" },
  overdue: { label: "En retard", className: "bg-red-100 text-red-800 border-red-200" },
  unknown: { label: "—", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

/**
 * Statut d'une échéance par date et/ou kilométrage.
 * `soonDays` : nombre de jours avant l'échéance pour passer en "bientôt".
 * `soonKm`   : nombre de km avant l'échéance kilométrique pour "bientôt".
 */
export function dueStatus(
  dueDate: Date | null | undefined,
  dueMileage: number | null | undefined,
  currentMileage: number | null | undefined,
  soonDays = 30,
  soonKm = 1000
): DueStatus {
  let status: DueStatus = "unknown";

  if (dueDate) {
    const days = Math.ceil(
      (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (days < 0) return "overdue";
    status = days <= soonDays ? "soon" : "ok";
  }

  if (dueMileage != null && currentMileage != null) {
    const remaining = dueMileage - currentMileage;
    if (remaining < 0) return "overdue";
    const kmStatus: DueStatus = remaining <= soonKm ? "soon" : "ok";
    // On garde le plus urgent des deux critères.
    if (status === "unknown") return kmStatus;
    if (kmStatus === "soon") return "soon";
  }

  return status;
}
