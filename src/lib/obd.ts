// Analyse des réponses ELM327 / OBD-II. Module SANS "server-only" : utilisé
// côté client (lecture temps réel) comme côté serveur si besoin.
//
// ⚠️ Les formats de réponse varient selon le protocole du véhicule (CAN,
// ISO 9141, KWP…). Les analyseurs ci-dessous couvrent les cas courants et sont
// tolérants ; ils peuvent nécessiter des ajustements après tests terrain.

const DTC_LETTERS = ["P", "C", "B", "U"];

/** Deux octets → code défaut normalisé (ex. 0x01,0x33 → "P0133"). */
function decodeDtcPair(a: number, b: number): string {
  const letter = DTC_LETTERS[(a >> 6) & 0x03];
  const d2 = (a >> 4) & 0x03;
  const d3 = a & 0x0f;
  const d4 = (b >> 4) & 0x0f;
  const d5 = b & 0x0f;
  return (
    letter +
    d2.toString(16) +
    d3.toString(16).toUpperCase() +
    d4.toString(16).toUpperCase() +
    d5.toString(16).toUpperCase()
  );
}

import { isValidDtc } from "@/lib/dtc-codes";

// Retire les lignes de bruit ELM327 et les préfixes de trame ISO-TP, puis
// renvoie le flux d'octets concaténé.
function responseBytes(raw: string): number[] {
  const lines = raw
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  let hex = "";
  for (let line of lines) {
    // Ligne d'indication de longueur ISO-TP (3 hexa) : on l'ignore.
    if (/^[0-9A-Fa-f]{3}$/.test(line)) continue;
    // Préfixe de compteur de trame multi-trame "0:", "1:"…
    line = line.replace(/^[0-9A-Fa-f]:/, "");
    hex += line.replace(/[^0-9A-Fa-f]/g, "");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

/** Vrai si la réponse indique l'absence de données ou un échec de lecture. */
export function isNoData(raw: string): boolean {
  const u = raw.toUpperCase();
  return (
    u.includes("NO DATA") ||
    u.includes("UNABLE TO CONNECT") ||
    u.includes("STOPPED") ||
    u.includes("BUS INIT: ERR")
  );
}

/**
 * Extrait les codes défaut d'une réponse mode 03 (stockés), 07 (en attente) ou
 * 0A (permanents). Tolérant au compteur de DTC (CAN) et aux réponses multi-ECU.
 */
export function parseDtcCodes(
  raw: string,
  mode: "03" | "07" | "0A" = "03"
): string[] {
  if (isNoData(raw)) return [];
  const marker = mode === "07" ? 0x47 : mode === "0A" ? 0x4a : 0x43;
  const bytes = responseBytes(raw);
  const codes: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] !== marker) {
      i++;
      continue;
    }
    i++; // passe le marqueur de mode
    // Fin du segment = prochain marqueur ou fin du flux.
    let end = bytes.length;
    for (let j = i; j < bytes.length; j++) {
      if (bytes[j] === marker) {
        end = j;
        break;
      }
    }
    let seg = bytes.slice(i, end);
    // En CAN, le 1er octet est le nombre de DTC → longueur impaire : on le saute.
    if (seg.length % 2 === 1) seg = seg.slice(1);
    for (let k = 0; k + 1 < seg.length; k += 2) {
      const a = seg[k];
      const b = seg[k + 1];
      if (a === 0 && b === 0) continue; // pas de code
      const code = decodeDtcPair(a, b);
      if (isValidDtc(code)) codes.push(code);
    }
    i = end;
  }
  return Array.from(new Set(codes));
}

/** Extrait le VIN d'une réponse mode 09 PID 02. */
export function parseVin(raw: string): string | null {
  if (isNoData(raw)) return null;
  const bytes = responseBytes(raw);
  // Repère le marqueur de réponse 49 02.
  let idx = -1;
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x02) {
      idx = i + 2;
      break;
    }
  }
  if (idx < 0) return null;
  let data = bytes.slice(idx);
  // Octet de comptage de messages (souvent 0x01).
  if (data.length && data[0] === 0x01) data = data.slice(1);
  // Bourrage 0x00 en tête sur certains ECU.
  data = data.filter((b) => b !== 0x00);
  const ascii = data
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ""))
    .join("");
  const vin = ascii.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
  return vin.length >= 11 ? vin.slice(0, 17) : null;
}

/** Tension batterie mesurée par l'ELM327 (commande ATRV → ex. "12.4V"). */
export function parseAtrvVoltage(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*V/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
}

// Octets de données d'une réponse mode 01 pour un PID donné (ex. "010C" → les
// octets qui suivent "41 0C").
export function obdDataBytes(raw: string, pidCmd: string): number[] | null {
  if (isNoData(raw)) return null;
  const respMode = (parseInt(pidCmd.slice(0, 2), 16) + 0x40)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
  const pid = pidCmd.slice(2, 4).toUpperCase();
  const marker = respMode + pid;
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  const at = hex.indexOf(marker);
  if (at < 0) return null;
  const rest = hex.slice(at + marker.length);
  const bytes: number[] = [];
  for (let i = 0; i + 1 < rest.length; i += 2) {
    bytes.push(parseInt(rest.slice(i, i + 2), 16));
  }
  return bytes;
}

export type LivePid = {
  key: string;
  cmd: string; // commande OBD (ex. "010C")
  label: string;
  unit: string;
  /** Convertit les octets de données en valeur, ou null si insuffisant. */
  parse: (b: number[]) => number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** PID temps réel usuels (mode 01). Filtrés par les PID réellement supportés. */
export const LIVE_PIDS: LivePid[] = [
  {
    key: "rpm",
    cmd: "010C",
    label: "Régime moteur",
    unit: "tr/min",
    parse: (b) => (b.length >= 2 ? Math.round((b[0] * 256 + b[1]) / 4) : null),
  },
  {
    key: "speed",
    cmd: "010D",
    label: "Vitesse",
    unit: "km/h",
    parse: (b) => (b.length >= 1 ? b[0] : null),
  },
  {
    key: "coolant",
    cmd: "0105",
    label: "Temp. liquide",
    unit: "°C",
    parse: (b) => (b.length >= 1 ? b[0] - 40 : null),
  },
  {
    key: "oil",
    cmd: "015C",
    label: "Temp. huile",
    unit: "°C",
    parse: (b) => (b.length >= 1 ? b[0] - 40 : null),
  },
  {
    key: "load",
    cmd: "0104",
    label: "Charge moteur",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "absLoad",
    cmd: "0143",
    label: "Charge absolue",
    unit: "%",
    parse: (b) =>
      b.length >= 2 ? Math.round(((b[0] * 256 + b[1]) * 100) / 255) : null,
  },
  {
    key: "throttle",
    cmd: "0111",
    label: "Papillon",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "timing",
    cmd: "010E",
    label: "Avance allumage",
    unit: "°",
    parse: (b) => (b.length >= 1 ? round1(b[0] / 2 - 64) : null),
  },
  {
    key: "maf",
    cmd: "0110",
    label: "Débit d'air (MAF)",
    unit: "g/s",
    parse: (b) => (b.length >= 2 ? round1((b[0] * 256 + b[1]) / 100) : null),
  },
  {
    key: "map",
    cmd: "010B",
    label: "Pression admission",
    unit: "kPa",
    parse: (b) => (b.length >= 1 ? b[0] : null),
  },
  {
    key: "baro",
    cmd: "0133",
    label: "Pression atmo.",
    unit: "kPa",
    parse: (b) => (b.length >= 1 ? b[0] : null),
  },
  {
    key: "fuelPress",
    cmd: "010A",
    label: "Pression carburant",
    unit: "kPa",
    parse: (b) => (b.length >= 1 ? b[0] * 3 : null),
  },
  {
    key: "stft",
    cmd: "0106",
    label: "Correction court terme",
    unit: "%",
    parse: (b) => (b.length >= 1 ? round1((b[0] - 128) * (100 / 128)) : null),
  },
  {
    key: "ltft",
    cmd: "0107",
    label: "Correction long terme",
    unit: "%",
    parse: (b) => (b.length >= 1 ? round1((b[0] - 128) * (100 / 128)) : null),
  },
  {
    key: "intake",
    cmd: "010F",
    label: "Temp. admission",
    unit: "°C",
    parse: (b) => (b.length >= 1 ? b[0] - 40 : null),
  },
  {
    key: "ambient",
    cmd: "0146",
    label: "Temp. extérieure",
    unit: "°C",
    parse: (b) => (b.length >= 1 ? b[0] - 40 : null),
  },
  {
    key: "fuel",
    cmd: "012F",
    label: "Niveau carburant",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "runtime",
    cmd: "011F",
    label: "Temps moteur",
    unit: "s",
    parse: (b) => (b.length >= 2 ? b[0] * 256 + b[1] : null),
  },
  {
    key: "milDist",
    cmd: "0121",
    label: "Distance voyant allumé",
    unit: "km",
    parse: (b) => (b.length >= 2 ? b[0] * 256 + b[1] : null),
  },
  {
    key: "voltage",
    cmd: "0142",
    label: "Tension calculateur",
    unit: "V",
    parse: (b) => (b.length >= 2 ? round1((b[0] * 256 + b[1]) / 1000) : null),
  },
];

/** Lit la valeur d'un PID temps réel depuis une réponse brute. */
export function parseLivePid(pid: LivePid, raw: string): number | null {
  const bytes = obdDataBytes(raw, pid.cmd);
  return bytes ? pid.parse(bytes) : null;
}

/**
 * Analyse une réponse de PID « supportés » (0100, 0120, 0140…) : 4 octets de
 * masque de bits. Renvoie l'ensemble des numéros de PID supportés (ex. "0C").
 */
export function parseSupportedPids(raw: string, cmd: string): Set<string> {
  const set = new Set<string>();
  const bytes = obdDataBytes(raw, cmd);
  if (!bytes || bytes.length < 4) return set;
  const base = parseInt(cmd.slice(2, 4), 16);
  for (let i = 0; i < 4; i++) {
    for (let bit = 0; bit < 8; bit++) {
      if (bytes[i] & (0x80 >> bit)) {
        const pidNum = base + i * 8 + bit + 1;
        set.add(pidNum.toString(16).toUpperCase().padStart(2, "0"));
      }
    }
  }
  return set;
}

/** Numéro de PID (partie après le mode) d'une commande, ex. "010C" → "0C". */
export function pidNumber(cmd: string): string {
  return cmd.slice(2, 4).toUpperCase();
}

export type MonitorItem = {
  key: string;
  label: string;
  available: boolean;
  complete: boolean;
};
export type MonitorStatus = {
  milOn: boolean;
  dtcCount: number;
  compressionIgnition: boolean; // true = diesel
  monitors: MonitorItem[];
};

// Libellés des contrôles de préparation (readiness monitors).
const CONTINUOUS_MONITORS: { bit: number; key: string; label: string }[] = [
  { bit: 0x01, key: "catalyst", label: "Catalyseur" },
  { bit: 0x02, key: "heatedCatalyst", label: "Catalyseur chauffé" },
  { bit: 0x04, key: "evap", label: "Système EVAP (vapeurs)" },
  { bit: 0x08, key: "secondaryAir", label: "Air secondaire" },
  { bit: 0x10, key: "acRefrigerant", label: "Circuit climatisation" },
  { bit: 0x20, key: "o2Sensor", label: "Sonde à oxygène" },
  { bit: 0x40, key: "o2Heater", label: "Chauffage sonde O2" },
  { bit: 0x80, key: "egr", label: "Vanne EGR" },
];

/**
 * État des contrôles de préparation (mode 01 PID 01) : voyant moteur, nombre de
 * DTC, et statut des « monitors » (utile pour savoir si la voiture est prête
 * pour le contrôle technique).
 */
export function parseMonitorStatus(raw: string): MonitorStatus | null {
  const b = obdDataBytes(raw, "0101");
  if (!b || b.length < 4) return null;
  const [a, bByte, c, d] = b;
  const milOn = (a & 0x80) !== 0;
  const dtcCount = a & 0x7f;
  const compressionIgnition = (bByte & 0x08) !== 0;

  const monitors: MonitorItem[] = [];
  // Monitors non continus (octet B).
  const nonContinuous: { bit: number; key: string; label: string }[] = [
    { bit: 0x01, key: "misfire", label: "Ratés d'allumage" },
    { bit: 0x02, key: "fuelSystem", label: "Système carburant" },
    { bit: 0x04, key: "components", label: "Composants" },
  ];
  for (const m of nonContinuous) {
    const available = (bByte & m.bit) !== 0;
    const incomplete = (bByte & (m.bit << 4)) !== 0;
    monitors.push({
      key: m.key,
      label: m.label,
      available,
      complete: available && !incomplete,
    });
  }
  // Monitors continus (octet C = disponible, octet D = incomplet).
  for (const m of CONTINUOUS_MONITORS) {
    const available = (c & m.bit) !== 0;
    const incomplete = (d & m.bit) !== 0;
    monitors.push({
      key: m.key,
      label: m.label,
      available,
      complete: available && !incomplete,
    });
  }
  return { milOn, dtcCount, compressionIgnition, monitors };
}

/** DTC ayant déclenché l'enregistrement du freeze frame (mode 02 PID 02). */
export function parseFreezeFrameDtc(raw: string): string | null {
  if (isNoData(raw)) return null;
  const bytes = responseBytes(raw);
  for (let i = 0; i + 3 < bytes.length; i++) {
    // Marqueur 42 02 puis le DTC (2 octets).
    if (bytes[i] === 0x42 && bytes[i + 1] === 0x02) {
      const a = bytes[i + 2];
      const b = bytes[i + 3];
      if (a === 0 && b === 0) return null;
      const code = decodeDtcPair(a, b);
      return isValidDtc(code) ? code : null;
    }
  }
  return null;
}
