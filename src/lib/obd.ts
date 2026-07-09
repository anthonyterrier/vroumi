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

import { isValidDtc, describeDtc } from "@/lib/dtc-codes";

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
    key: "odometer",
    cmd: "01A6",
    label: "Kilométrage (odomètre)",
    unit: "km",
    // PID A6 (standard récent) : 4 octets, résolution 0,1 km.
    parse: (b) =>
      b.length >= 4
        ? Math.round(
            (b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3]) / 10
          )
        : null,
  },
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
  {
    key: "catTemp",
    cmd: "013C",
    label: "Temp. catalyseur",
    unit: "°C",
    parse: (b) => (b.length >= 2 ? round1((b[0] * 256 + b[1]) / 10 - 40) : null),
  },
  {
    key: "fuelRail",
    cmd: "0123",
    label: "Pression rampe carb.",
    unit: "kPa",
    parse: (b) => (b.length >= 2 ? (b[0] * 256 + b[1]) * 10 : null),
  },
  {
    key: "egrCmd",
    cmd: "012C",
    label: "EGR commandé",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "egrError",
    cmd: "012D",
    label: "Erreur EGR",
    unit: "%",
    parse: (b) => (b.length >= 1 ? round1((b[0] - 128) * (100 / 128)) : null),
  },
  {
    key: "o2v",
    cmd: "0114",
    label: "Sonde O2 (tension)",
    unit: "V",
    parse: (b) => (b.length >= 1 ? round1(b[0] / 200) : null),
  },
  {
    key: "lambda",
    cmd: "0144",
    label: "Richesse commandée λ",
    unit: "",
    parse: (b) =>
      b.length >= 2 ? Math.round(((b[0] * 256 + b[1]) / 32768) * 100) / 100 : null,
  },
  {
    key: "pedal",
    cmd: "0149",
    label: "Pédale accélérateur",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "fuelRate",
    cmd: "015E",
    label: "Conso instantanée",
    unit: "L/h",
    parse: (b) => (b.length >= 2 ? round1((b[0] * 256 + b[1]) / 20) : null),
  },
  {
    key: "distCleared",
    cmd: "0131",
    label: "Distance depuis effacement",
    unit: "km",
    parse: (b) => (b.length >= 2 ? b[0] * 256 + b[1] : null),
  },
  {
    key: "ethanol",
    cmd: "0152",
    label: "Éthanol",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "stft2",
    cmd: "0108",
    label: "Correction court terme (banc 2)",
    unit: "%",
    parse: (b) => (b.length >= 1 ? round1((b[0] - 128) * (100 / 128)) : null),
  },
  {
    key: "ltft2",
    cmd: "0109",
    label: "Correction long terme (banc 2)",
    unit: "%",
    parse: (b) => (b.length >= 1 ? round1((b[0] - 128) * (100 / 128)) : null),
  },
  {
    key: "warmups",
    cmd: "0130",
    label: "Démarrages depuis effacement",
    unit: "",
    parse: (b) => (b.length >= 1 ? b[0] : null),
  },
  {
    key: "evapPress",
    cmd: "0132",
    label: "Pression vapeurs carbu.",
    unit: "Pa",
    parse: (b) => {
      if (b.length < 2) return null;
      const raw = (b[0] << 8) | b[1];
      const signed = raw > 32767 ? raw - 65536 : raw;
      return round1(signed / 4);
    },
  },
  {
    key: "relThrottle",
    cmd: "0145",
    label: "Papillon relatif",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "absThrottleB",
    cmd: "0147",
    label: "Papillon absolu B",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "pedalE",
    cmd: "014A",
    label: "Pédale accélérateur E",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "commThrottle",
    cmd: "014C",
    label: "Papillon commandé",
    unit: "%",
    parse: (b) => (b.length >= 1 ? Math.round((b[0] * 100) / 255) : null),
  },
  {
    key: "timeMil",
    cmd: "014D",
    label: "Temps voyant allumé",
    unit: "min",
    parse: (b) => (b.length >= 2 ? b[0] * 256 + b[1] : null),
  },
  {
    key: "timeCleared",
    cmd: "014E",
    label: "Temps depuis effacement",
    unit: "min",
    parse: (b) => (b.length >= 2 ? b[0] * 256 + b[1] : null),
  },
];

/** Sous-ensemble de PID lus dans le freeze frame (instantané au défaut). */
export const FREEZE_PID_KEYS = [
  "rpm",
  "speed",
  "load",
  "coolant",
  "stft",
  "ltft",
  "map",
  "timing",
  "throttle",
] as const;

/** Lit la valeur d'un PID temps réel depuis une réponse brute. */
export function parseLivePid(pid: LivePid, raw: string): number | null {
  const bytes = obdDataBytes(raw, pid.cmd);
  return bytes ? pid.parse(bytes) : null;
}

// Octets de données d'une réponse mode 02 (freeze frame) : "42 <PID> <frame>
// <data>". On repère 42+PID, puis on saute l'octet de numéro de trame.
function obdFreezeBytes(raw: string, pid: string): number[] | null {
  if (isNoData(raw)) return null;
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  const marker = "42" + pid.toUpperCase();
  const at = hex.indexOf(marker);
  if (at < 0) return null;
  const rest = hex.slice(at + marker.length);
  const bytes: number[] = [];
  for (let i = 0; i + 1 < rest.length; i += 2) {
    bytes.push(parseInt(rest.slice(i, i + 2), 16));
  }
  return bytes.slice(1); // saute l'octet de numéro de trame
}

/** Commande à envoyer pour lire un PID dans le freeze frame (mode 02, trame 0). */
export function freezeCommand(pid: LivePid): string {
  return "02" + pidNumber(pid.cmd) + "00";
}

/** Lit la valeur d'un PID depuis une réponse freeze frame (mode 02). */
export function parseFreezePid(pid: LivePid, raw: string): number | null {
  const bytes = obdFreezeBytes(raw, pidNumber(pid.cmd));
  return bytes ? pid.parse(bytes) : null;
}

/** Nom du calculateur (mode 09 PID 0A) : ASCII, potentiellement multi-trame. */
export function parseEcuName(raw: string): string | null {
  if (isNoData(raw)) return null;
  const bytes = responseBytes(raw);
  let idx = -1;
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x0a) {
      idx = i + 2;
      break;
    }
  }
  if (idx < 0) return null;
  let data = bytes.slice(idx);
  if (data.length && data[0] === 0x01) data = data.slice(1); // octet de comptage
  const ascii = data
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ""))
    .join("")
    .trim();
  return ascii || null;
}

// Octets de données d'une réponse mode 09 pour un PID donné (après le marqueur
// « 49 <pid> » et l'éventuel octet de comptage de messages).
function mode09Data(raw: string, pid: number): number[] | null {
  if (isNoData(raw)) return null;
  const bytes = responseBytes(raw);
  let idx = -1;
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x49 && bytes[i + 1] === pid) {
      idx = i + 2;
      break;
    }
  }
  if (idx < 0) return null;
  let data = bytes.slice(idx);
  // Octet de comptage de messages (petit nombre, souvent 0x01) en tête.
  if (data.length && data[0] <= 0x08) data = data.slice(1);
  return data;
}

/** Calibration ID (mode 09 PID 04) — chaîne(s) ASCII, séparées si plusieurs. */
export function parseCalibrationId(raw: string): string | null {
  const data = mode09Data(raw, 0x04);
  if (!data) return null;
  // Les IDs font 16 octets, complétés par des 0x00. On les rend lisibles.
  const ascii = data
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : b === 0 ? " " : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return ascii || null;
}

/** CVN — Calibration Verification Numbers (mode 09 PID 06), en hexadécimal. */
export function parseCvn(raw: string): string | null {
  const data = mode09Data(raw, 0x06);
  if (!data) return null;
  const groups: string[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    groups.push(
      data
        .slice(i, i + 4)
        .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
        .join("")
    );
  }
  return groups.length ? groups.join(" ") : null;
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

// --- VAG / UDS (style VCDS) ------------------------------------------------
//
// Lecture des défauts par calculateur sur bus CAN (ISO 15765) via l'adressage
// UDS propre au groupe VW/Audi/Seat/Skoda. Chaque module a un en-tête de requête
// (tx) et une adresse de réponse (rx). Pour le powertrain rx = tx + 8 ; pour les
// autres modules rx = tx + 0x6A (schéma VAG documenté par la communauté).
// ⚠️ Indicatif : les adresses varient selon la plateforme/passerelle du modèle.
export type VagModule = { id: string; name: string; tx: string; rx: string };

export const VAG_MODULES: VagModule[] = [
  { id: "01", name: "Moteur (01)", tx: "7E0", rx: "7E8" },
  { id: "02", name: "Boîte de vitesses (02)", tx: "7E1", rx: "7E9" },
  { id: "03", name: "ABS / ESP (03)", tx: "713", rx: "77D" },
  { id: "08", name: "Climatisation (08)", tx: "746", rx: "7B0" },
  { id: "09", name: "Électronique centrale (09)", tx: "70E", rx: "778" },
  { id: "15", name: "Airbags (15)", tx: "715", rx: "77F" },
  { id: "16", name: "Électronique colonne direction (16)", tx: "716", rx: "780" },
  { id: "17", name: "Combiné / instruments (17)", tx: "714", rx: "77E" },
  { id: "19", name: "Passerelle / Gateway (19)", tx: "710", rx: "77A" },
  { id: "44", name: "Direction assistée (44)", tx: "712", rx: "77C" },
  { id: "5F", name: "Électronique info / MMI (5F)", tx: "773", rx: "7DD" },
];

export type UdsDtc = {
  code: string; // code P/C/B/U dérivé des 2 premiers octets
  raw: string; // 3 octets UDS bruts en hexa
  status: number; // octet de statut UDS
  description: string; // libellé générique si connu
};

/** Vrai si la réponse est un « negative response » UDS (7F <sid> <nrc>). */
export function isUdsNegative(raw: string): boolean {
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return hex.includes("7F19");
}

/**
 * Analyse une réponse UDS 0x19 sous-fonction 0x02 (reportDTCByStatusMask) :
 * « 59 02 <mask> [dtc(3) statut(1)]… ». Renvoie la liste des défauts, [] si le
 * module répond sans défaut, ou null si pas de réponse exploitable.
 */
export function parseUdsDtcs(raw: string): UdsDtc[] | null {
  if (isNoData(raw)) return null;
  const bytes = responseBytes(raw);
  let idx = -1;
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x59 && bytes[i + 1] === 0x02) {
      idx = i + 2;
      break;
    }
  }
  if (idx < 0) return null;
  // Octet suivant = masque de disponibilité du statut, on le saute.
  const data = bytes.slice(idx + 1);
  const out: UdsDtc[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const b0 = data[i];
    const b1 = data[i + 1];
    const b2 = data[i + 2];
    const status = data[i + 3];
    if (b0 === 0 && b1 === 0 && b2 === 0) continue;
    const code = decodeDtcPair(b0, b1);
    const rawHex = [b0, b1, b2]
      .map((x) => x.toString(16).toUpperCase().padStart(2, "0"))
      .join("");
    out.push({ code, raw: rawHex, status, description: describeDtc(code) });
  }
  return out;
}
