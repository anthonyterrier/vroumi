// Libellés français pour les énumérations et utilitaires d'affichage.

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

/** Pictogramme associé à un type d'entretien (affichage compact). */
export const MAINTENANCE_TYPE_ICON: Record<string, string> = {
  VIDANGE: "🛢️",
  FILTRE_HUILE: "🛢️",
  FILTRE_AIR: "🌬️",
  FILTRE_HABITACLE: "🌬️",
  FILTRE_CARBURANT: "⛽",
  FREINS: "🛑",
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
  AUTRE: "🔧",
};

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
