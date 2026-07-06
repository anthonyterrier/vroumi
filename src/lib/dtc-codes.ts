// Décodage des codes défaut OBD-II (DTC). Module SANS "server-only" : utilisé
// côté client (lecture ELM327) comme côté serveur (affichage de l'historique).
//
// Un DTC fait 5 caractères : 1 lettre de système + 4 chiffres/hex.
//   Lettre : P = groupe motopropulseur, C = châssis, B = carrosserie, U = réseau.
//   1er chiffre : 0 = code générique (normalisé SAE), 1 = code constructeur.
// On fournit un libellé pour les codes génériques les plus courants, et à
// défaut une description structurelle (système + sous-système).

/** Libellés français de codes défaut génériques courants (liste non exhaustive). */
export const DTC_DESCRIPTIONS: Record<string, string> = {
  // Système d'alimentation et dosage air/carburant
  P0100: "Débit d'air massique / volume d'air – circuit",
  P0101: "Débit d'air massique – plage / performance",
  P0102: "Débit d'air massique – entrée basse",
  P0103: "Débit d'air massique – entrée haute",
  P0106: "Pression absolue collecteur (MAP) – plage / performance",
  P0107: "Pression absolue collecteur (MAP) – entrée basse",
  P0108: "Pression absolue collecteur (MAP) – entrée haute",
  P0110: "Capteur température d'air d'admission – circuit",
  P0111: "Température d'air d'admission – plage / performance",
  P0112: "Température d'air d'admission – entrée basse",
  P0113: "Température d'air d'admission – entrée haute",
  P0115: "Capteur température liquide de refroidissement – circuit",
  P0116: "Température liquide de refroidissement – plage / performance",
  P0117: "Température liquide de refroidissement – entrée basse",
  P0118: "Température liquide de refroidissement – entrée haute",
  P0120: "Capteur position papillon / pédale – circuit",
  P0121: "Position papillon / pédale – plage / performance",
  P0128: "Thermostat – température sous le seuil de régulation",
  P0130: "Sonde O2 (rangée 1, capteur 1) – circuit",
  P0131: "Sonde O2 (rangée 1, capteur 1) – tension basse",
  P0132: "Sonde O2 (rangée 1, capteur 1) – tension haute",
  P0133: "Sonde O2 (rangée 1, capteur 1) – réponse lente",
  P0134: "Sonde O2 (rangée 1, capteur 1) – pas d'activité",
  P0135: "Sonde O2 (rangée 1, capteur 1) – chauffage",
  P0136: "Sonde O2 (rangée 1, capteur 2) – circuit",
  P0141: "Sonde O2 (rangée 1, capteur 2) – chauffage",
  P0171: "Système trop pauvre (rangée 1)",
  P0172: "Système trop riche (rangée 1)",
  P0174: "Système trop pauvre (rangée 2)",
  P0175: "Système trop riche (rangée 2)",
  // Ratés d'allumage
  P0300: "Ratés d'allumage aléatoires / multiples",
  P0301: "Raté d'allumage cylindre 1",
  P0302: "Raté d'allumage cylindre 2",
  P0303: "Raté d'allumage cylindre 3",
  P0304: "Raté d'allumage cylindre 4",
  P0305: "Raté d'allumage cylindre 5",
  P0306: "Raté d'allumage cylindre 6",
  // Système d'allumage / distribution
  P0320: "Régime moteur / position vilebrequin – circuit",
  P0335: "Capteur position vilebrequin (CKP) – circuit",
  P0336: "Capteur position vilebrequin (CKP) – plage / performance",
  P0340: "Capteur position arbre à cames (CMP) – circuit",
  P0341: "Capteur position arbre à cames (CMP) – plage / performance",
  // Contrôle émissions
  P0400: "Recirculation gaz d'échappement (EGR) – débit",
  P0401: "EGR – débit insuffisant détecté",
  P0402: "EGR – débit excessif détecté",
  P0403: "EGR – circuit de commande",
  P0420: "Rendement catalyseur sous le seuil (rangée 1)",
  P0430: "Rendement catalyseur sous le seuil (rangée 2)",
  P0440: "Système EVAP (vapeurs carburant) – défaut général",
  P0442: "Système EVAP – petite fuite détectée",
  P0446: "Système EVAP – circuit de ventilation",
  P0455: "Système EVAP – grosse fuite détectée",
  // Régime ralenti / vitesse véhicule
  P0500: "Capteur vitesse véhicule – circuit",
  P0505: "Système de contrôle du ralenti",
  // Circuit / sorties calculateur
  P0562: "Tension système trop basse",
  P0563: "Tension système trop haute",
  P0600: "Liaison série / communication calculateur",
  P0601: "Calculateur (ECM) – erreur mémoire interne",
  P0605: "Calculateur (ECM) – erreur mémoire ROM",
  P0620: "Circuit de commande de l'alternateur",
  // Transmission
  P0700: "Système de commande de la boîte de vitesses",
  P0703: "Contacteur de frein – circuit (entrée B)",
  P0705: "Capteur position sélecteur (PRNDL) – circuit",
  // Diesel courants
  P0299: "Turbo / compresseur – sous-alimentation (underboost)",
  P0234: "Turbo / compresseur – suralimentation excessive (overboost)",
  P0087: "Pression rampe carburant trop basse",
  P0088: "Pression rampe carburant trop haute",
  P2002: "Filtre à particules (FAP) – rendement sous le seuil (rangée 1)",
  P242F: "Filtre à particules (FAP) – encrassement / restriction",
  P2463: "Filtre à particules (FAP) – accumulation de suie",
};

const SYSTEM_LABEL: Record<string, string> = {
  P: "Groupe motopropulseur (moteur / boîte)",
  C: "Châssis (freinage, direction, suspension)",
  B: "Carrosserie (habitacle, sécurité, confort)",
  U: "Réseau / communication (bus)",
};

// Sous-système pour les codes P (2e caractère).
const P_SUBSYSTEM: Record<string, string> = {
  "0": "dosage air/carburant et contrôle auxiliaire des émissions",
  "1": "dosage air/carburant",
  "2": "dosage air/carburant (circuit injecteurs)",
  "3": "système d'allumage / ratés d'allumage",
  "4": "contrôle auxiliaire des émissions",
  "5": "vitesse véhicule, ralenti et entrées auxiliaires",
  "6": "calculateur et sorties",
  "7": "transmission",
  "8": "transmission",
  "9": "transmission (SAE réservé)",
  A: "propulsion hybride",
  B: "propulsion hybride",
  C: "propulsion hybride",
};

/** Vrai si le code est un défaut valide (5 caractères, lettre + 4 hex). */
export function isValidDtc(code: string): boolean {
  return /^[PCBU][0-3][0-9A-F]{3}$/i.test(code);
}

/**
 * Description lisible d'un code défaut : libellé connu si disponible, sinon
 * description structurelle (système + générique/constructeur + sous-système).
 */
export function describeDtc(code: string): string {
  const c = code.toUpperCase();
  if (DTC_DESCRIPTIONS[c]) return DTC_DESCRIPTIONS[c];
  if (!isValidDtc(c)) return "Code non reconnu";

  const system = SYSTEM_LABEL[c[0]] ?? "Système inconnu";
  const manufacturerSpecific = c[1] === "1" || c[1] === "3";
  const origin = manufacturerSpecific
    ? "code spécifique constructeur"
    : "code générique";
  if (c[0] === "P") {
    const sub = P_SUBSYSTEM[c[2]];
    return sub
      ? `${system} — ${origin} (${sub})`
      : `${system} — ${origin}`;
  }
  return `${system} — ${origin}`;
}
