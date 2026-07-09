"use client";

import { useEffect, useRef, useState } from "react";
import {
  LIVE_PIDS,
  FREEZE_PID_KEYS,
  parseDtcCodes,
  parseLivePid,
  parseVin,
  parseAtrvVoltage,
  parseSupportedPids,
  parseMonitorStatus,
  parseFreezeFrameDtc,
  parseEcuName,
  parseCalibrationId,
  parseCvn,
  freezeCommand,
  parseFreezePid,
  pidNumber,
  type MonitorStatus,
} from "@/lib/obd";
import { describeDtc } from "@/lib/dtc-codes";
import {
  saveVin,
  saveDiagnosticReport,
  type DiagnosticCode,
} from "@/app/(app)/vehicles/[id]/diagnostic-actions";
import {
  diagnoseWithAI,
  saveOdometer,
  resetProcedureFromVin,
  startVehicleKnowledgeResearch,
  getVehicleKnowledge,
} from "@/app/(app)/vehicles/[id]/diagnosis-ai-actions";
import {
  SEVERITY_STYLE,
  LIKELIHOOD_STYLE,
  type ObdDiagnosis,
  type ObdSnapshot,
} from "@/lib/obd-diagnosis-fields";
import type { ResetProcedure } from "@/lib/obd-reset-fields";
import type { VehicleKnowledge } from "@/lib/vehicle-knowledge-fields";

// --- Types Web Bluetooth minimaux (absents de lib.dom par défaut) ---------
type BtChar = {
  properties: {
    notify: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
  };
  value?: DataView;
  startNotifications: () => Promise<BtChar>;
  addEventListener: (t: string, cb: (e: Event) => void) => void;
  writeValue: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};
type BtService = { getCharacteristics: () => Promise<BtChar[]> };
type BtServer = {
  connect: () => Promise<BtServer>;
  getPrimaryServices: () => Promise<BtService[]>;
  getPrimaryService: (uuid: string) => Promise<BtService>;
  disconnect: () => void;
};
type BtDevice = {
  id: string;
  name?: string;
  gatt?: BtServer;
  addEventListener: (t: string, cb: () => void) => void;
};
type BtLike = {
  requestDevice: (opts?: unknown) => Promise<BtDevice>;
  getDevices?: () => Promise<BtDevice[]>;
};

// Services BLE « série » usuels des ELM327 (doivent être déclarés pour être
// accessibles avec acceptAllDevices).
const u16 = (n: number) =>
  `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
const OBD_SERVICES = [
  u16(0xfff0), // vLinker / vgate iCar Pro (fff1 notify / fff2 write)
  u16(0xffe0), // HM-10 & clones (ffe1 read+write+notify)
  u16(0xffe5),
  u16(0xffb0),
  u16(0xff00),
  u16(0x18f0), // certains modules BLE série
  u16(0xfee7),
  u16(0xfff6),
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];
const DEVICE_ID_KEY = "obd.deviceId";
const DEVICE_NAME_KEY = "obd.deviceName";

type Conn = {
  device: BtDevice;
  writeChar: BtChar;
  notifyChar: BtChar;
  buffer: string;
  resolver: ((s: string) => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
};

export function ObdDiagnostic({
  vehicleId,
  canEditVehicle,
  canJournal,
  canSaveMileage,
  aiEnabled,
  resetAiEnabled,
  knowledgeAiEnabled,
  hasVehicleIdentity,
  initialKnowledge,
  knowledgeUpdatedAt,
  vehicleVin,
  currentMileage,
  lastReportCodes,
  lastReportDate,
}: {
  vehicleId: string;
  canEditVehicle: boolean;
  canJournal: boolean;
  canSaveMileage: boolean;
  aiEnabled: boolean;
  resetAiEnabled: boolean;
  knowledgeAiEnabled: boolean;
  hasVehicleIdentity: boolean;
  initialKnowledge: VehicleKnowledge | null;
  knowledgeUpdatedAt: string | null;
  vehicleVin: string | null;
  currentMileage: number | null;
  lastReportCodes: string[];
  lastReportDate: string | null;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Nom du dernier adaptateur mémorisé (pour la reconnexion automatique).
  const [rememberedName, setRememberedName] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [ecuName, setEcuName] = useState<string | null>(null);
  const [codes, setCodes] = useState<DiagnosticCode[]>([]);
  const [freezeDtc, setFreezeDtc] = useState<string | null>(null);
  const [freezeData, setFreezeData] = useState<Record<string, number | null>>(
    {}
  );
  const [monitors, setMonitors] = useState<MonitorStatus | null>(null);
  const [readDone, setReadDone] = useState(false);
  const [vin, setVin] = useState<string | null>(null);
  const [voltage, setVoltage] = useState<number | null>(null);
  const [live, setLive] = useState<Record<string, number | null>>({});
  const [supportedPids, setSupportedPids] = useState<Set<string>>(new Set());
  const [liveOn, setLiveOn] = useState(false);
  // Extraction automatique de toutes les infos véhicule (mode 09 + AT).
  const [vehicleInfo, setVehicleInfo] = useState<
    { label: string; value: string }[]
  >([]);
  const [infoBusy, setInfoBusy] = useState(false);
  // Console de commandes brute (mode avancé).
  const [rawCmd, setRawCmd] = useState("");
  const [rawLog, setRawLog] = useState<{ cmd: string; res: string }[]>([]);
  // Recherche IA de la procédure de réinitialisation d'entretien (via VIN).
  const [resetProc, setResetProc] = useState<ResetProcedure | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Base de connaissances IA du modèle (pannes, commandes spécifiques…).
  const [knowledge, setKnowledge] = useState<VehicleKnowledge | null>(
    initialKnowledge
  );
  const [knowUpdatedAt, setKnowUpdatedAt] = useState<string | null>(
    knowledgeUpdatedAt
  );
  const [knowBusy, setKnowBusy] = useState(false);
  const [knowError, setKnowError] = useState<string | null>(null);
  // Réponses des commandes spécifiques testées (clé = commande).
  const [cmdResults, setCmdResults] = useState<Record<string, string>>({});
  const knowFetchedRef = useRef(false);
  // Stoppe le sondage de la base de connaissances si le composant est démonté.
  const knowledgeAliveRef = useRef(true);
  // Aide au diagnostic IA.
  const [aiDiag, setAiDiag] = useState<ObdDiagnosis | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [odoSaved, setOdoSaved] = useState(false);
  const [mileage, setMileage] = useState<string>(
    currentMileage != null ? String(currentMileage) : ""
  );

  const connRef = useRef<Conn | null>(null);
  const liveOnRef = useRef(false);
  const liveRunningRef = useRef(false);
  // Signature des codes du dernier relevé enregistré automatiquement (dédup).
  const lastSavedRef = useRef<string | null>(null);
  // PID mode 01 supportés par le véhicule (null = pas encore découverts).
  const supportedRef = useRef<Set<string> | null>(null);

  // Arrête tout sondage en cours au démontage du composant.
  useEffect(() => {
    knowledgeAliveRef.current = true;
    return () => {
      knowledgeAliveRef.current = false;
    };
  }, []);

  // --- Transport BLE ------------------------------------------------------
  function onNotify(e: Event) {
    const dv = (e.target as unknown as BtChar).value;
    const c = connRef.current;
    if (!dv || !c) return;
    let s = "";
    for (let i = 0; i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(i));
    c.buffer += s;
    if (c.buffer.includes(">") && c.resolver) {
      const out = c.buffer.replace(/>/g, "");
      c.buffer = "";
      const r = c.resolver;
      c.resolver = null;
      if (c.timer) clearTimeout(c.timer);
      r(out);
    }
  }

  function send(cmd: string, timeout = 5000): Promise<string> {
    const c = connRef.current;
    if (!c) return Promise.reject(new Error("Non connecté"));
    c.buffer = "";
    const data = new TextEncoder().encode(cmd + "\r");
    return new Promise<string>((resolve, reject) => {
      c.resolver = resolve;
      c.timer = setTimeout(() => {
        c.resolver = null;
        reject(new Error(`Délai dépassé (${cmd})`));
      }, timeout);
      const w = c.writeChar;
      const p =
        w.properties.writeWithoutResponse && w.writeValueWithoutResponse
          ? w.writeValueWithoutResponse(data)
          : w.writeValue(data);
      p.catch((err: unknown) => {
        if (c.timer) clearTimeout(c.timer);
        c.resolver = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  // Retrouve l'adaptateur déjà autorisé/mémorisé (sans ouvrir le sélecteur).
  // Nécessite navigator.bluetooth.getDevices() (Chrome/Chromium ; absent sur
  // certains navigateurs iOS).
  async function getRememberedDevice(): Promise<BtDevice | null> {
    const bt = (navigator as unknown as { bluetooth: BtLike }).bluetooth;
    if (!bt.getDevices) return null;
    try {
      const known = await bt.getDevices();
      if (!known.length) return null;
      const saved = localStorage.getItem(DEVICE_ID_KEY);
      if (saved) {
        const match = known.find((x) => x.id === saved);
        if (match) return match;
      }
      // Beaucoup d'adaptateurs OBD changent d'identifiant BLE à chaque session :
      // on retrouve alors l'appareil par son NOM mémorisé (identité stable, ce
      // qui rend la reconnexion fiable — comme pour l'imprimante Niimbot).
      const savedName = localStorage.getItem(DEVICE_NAME_KEY);
      if (savedName) {
        const byName = known.find((x) => (x.name ?? "") === savedName);
        if (byName) return byName;
      }
      // Un seul appareil déjà autorisé → on le prend.
      return known.length === 1 ? known[0] : null;
    } catch {
      return null;
    }
  }

  // Établit la liaison GATT + découverte des caractéristiques, initialise
  // l'ELM327 et lance la lecture automatique. Commun à la connexion manuelle
  // et à la reconnexion automatique.
  async function setupDevice(device: BtDevice) {
    if (!device.gatt) throw new Error("GATT indisponible sur cet appareil.");
    const server = await device.gatt.connect();

    // On interroge CHAQUE service candidat par son UUID (getPrimaryService),
    // plutôt que getPrimaryServices() sans argument — ce dernier échoue sur
    // Bluefy/iOS (« No Services found in device ») même quand le service
    // existe. On s'arrête au premier service exposant write + notify.
    let writeChar: BtChar | undefined;
    let notifyChar: BtChar | undefined;
    for (const uuid of OBD_SERVICES) {
      let service: BtService;
      try {
        service = await server.getPrimaryService(uuid);
      } catch {
        continue; // service absent sur cet appareil → suivant
      }
      let chars: BtChar[];
      try {
        chars = await service.getCharacteristics();
      } catch {
        continue;
      }
      writeChar = undefined;
      notifyChar = undefined;
      for (const ch of chars) {
        if (!notifyChar && ch.properties.notify) notifyChar = ch;
        if (
          !writeChar &&
          (ch.properties.write || ch.properties.writeWithoutResponse)
        ) {
          writeChar = ch;
        }
      }
      if (writeChar && notifyChar) break;
    }
    if (!writeChar || !notifyChar) {
      throw new Error(
        "Service série ELM327 introuvable sur cet adaptateur (aucun des UUID connus). Envoie-moi le modèle exact et je l'ajoute."
      );
    }

    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", onNotify);
    connRef.current = {
      device,
      writeChar,
      notifyChar,
      buffer: "",
      resolver: null,
      timer: null,
    };
    device.addEventListener("gattserverdisconnected", () => {
      stopLive();
      connRef.current = null;
      setConnected(false);
      setStatus("Adaptateur déconnecté.");
    });

    // Séquence d'initialisation ELM327.
    await send("ATZ", 6000).catch(() => {});
    for (const cmd of ["ATE0", "ATL0", "ATS0", "ATSP0", "ATH0"]) {
      await send(cmd).catch(() => {});
    }
    // Réveille le bus (sélection auto du protocole).
    await send("0100", 8000).catch(() => {});
    // Protocole réellement utilisé (ex. « ISO 9141-2 », « CAN 11/500 »).
    try {
      const dp = (await send("ATDP", 4000)).replace(/[\r\n>]/g, "").trim();
      setProtocol(dp || null);
    } catch {
      // non bloquant
    }
    // Nom du calculateur (mode 09 PID 0A), si fourni.
    try {
      setEcuName(parseEcuName(await send("090A", 5000)));
    } catch {
      setEcuName(null);
    }
    // Découvre les PID mode 01 supportés (pour n'interroger que l'utile).
    await discoverSupportedPids();

    setConnected(true);
    setStatus("Connecté ✅ — lecture automatique en cours…");

    // À la connexion, on enchaîne automatiquement : VIN, codes défaut, puis
    // démarrage des données temps réel. (Ces fonctions gèrent leurs propres
    // erreurs et ne relancent pas d'exception.)
    await readVin();
    await readCodes();
    startLive();

    // À la connexion, on construit la base de connaissances du modèle SEULEMENT
    // si elle n'existe pas encore. Une fois constituée, elle est réutilisée et
    // n'est PLUS recherchée automatiquement (mise à jour manuelle via le
    // bouton « Mettre à jour »).
    if (
      knowledgeAiEnabled &&
      hasVehicleIdentity &&
      !knowFetchedRef.current &&
      !knowledge
    ) {
      knowFetchedRef.current = true;
      void loadKnowledge(false);
    }
  }

  // Mémorise l'appareil retenu (id + nom) pour la prochaine reconnexion.
  function rememberDevice(device: BtDevice) {
    try {
      localStorage.setItem(DEVICE_ID_KEY, device.id);
      localStorage.setItem(DEVICE_NAME_KEY, device.name ?? "");
    } catch {
      // stockage indisponible : sans conséquence.
    }
    setRememberedName(device.name ?? null);
  }

  function savedDeviceName(): string {
    try {
      return localStorage.getItem(DEVICE_NAME_KEY) || "";
    } catch {
      return "";
    }
  }

  // Connexion. Ordre de préférence :
  //  1. adaptateur déjà autorisé et exposé par getDevices() → reconnexion SANS
  //     sélecteur (vrai auto). Indisponible sur certains navigateurs.
  //  2. sinon, sélecteur PRÉ-FILTRÉ sur le nom mémorisé (un seul adaptateur
  //     listé → un tap).
  //  3. forceChooser (« Changer d'adaptateur ») → sélecteur complet.
  async function connect(forceChooser = false) {
    if (!("bluetooth" in navigator) || !window.isSecureContext) {
      setStatus(
        "Web Bluetooth indisponible : utilise Chrome/Chromium (PC, Android) ou Bluefy (iOS), et accède au site en HTTPS."
      );
      return;
    }
    setBusy(true);
    const bt = (navigator as unknown as { bluetooth: BtLike }).bluetooth;
    try {
      let device: BtDevice | null = null;
      if (!forceChooser) {
        device = await getRememberedDevice();
        if (device) setStatus(`Reconnexion à ${device.name ?? "l'adaptateur"}…`);
      }
      if (!device) {
        const savedName = savedDeviceName();
        const useFilter = !forceChooser && !!savedName;
        if (useFilter) {
          setStatus(`Sélectionne « ${savedName} »…`);
          try {
            device = await bt.requestDevice({
              filters: [{ name: savedName }],
              optionalServices: OBD_SERVICES,
            });
          } catch {
            // Filtre sans résultat / annulation : on ouvre la liste complète.
            device = null;
          }
        }
        if (!device) {
          setStatus("Sélection de l'adaptateur…");
          device = await bt.requestDevice({
            acceptAllDevices: true,
            optionalServices: OBD_SERVICES,
          });
        }
      }
      rememberDevice(device);
      await setupDevice(device);
    } catch (e) {
      setStatus("Connexion impossible : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Au chargement : affiche le dernier adaptateur mémorisé et tente une
  // reconnexion automatique s'il est déjà autorisé et à portée. Ne requiert pas
  // de geste utilisateur car on ne passe pas par le sélecteur.
  useEffect(() => {
    let cancelled = false;
    try {
      const name = localStorage.getItem(DEVICE_NAME_KEY);
      if (name) setRememberedName(name);
    } catch {
      // stockage indisponible
    }
    if (!("bluetooth" in navigator) || !window.isSecureContext) return;
    (async () => {
      const device = await getRememberedDevice();
      if (cancelled || !device) return;
      setRememberedName(device.name ?? null);
      setBusy(true);
      setStatus(`Reconnexion automatique à ${device.name ?? "l'adaptateur"}…`);
      try {
        await setupDevice(device);
      } catch {
        // Échec silencieux : l'adaptateur est peut-être éteint / hors de portée.
        if (!cancelled) {
          setStatus(
            `Dernier adaptateur : ${device.name ?? "mémorisé"}. Appuie sur « Connecter » (vérifie qu'il est branché et allumé).`
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function disconnect() {
    stopLive();
    try {
      connRef.current?.device.gatt?.disconnect();
    } catch {
      // ignore
    }
    connRef.current = null;
    setConnected(false);
    setStatus("Déconnecté.");
  }

  // --- Découverte des PID supportés --------------------------------------
  async function discoverSupportedPids() {
    const supported = new Set<string>();
    // Plages de PID mode 01. Le dernier PID de chaque plage (0x20, 0x40…)
    // indique si la plage SUIVANTE est supportée → on ne l'interroge qu'alors
    // (rapide sur les vieux véhicules, et va jusqu'à A6 = odomètre sur les
    // récents).
    const ranges = ["0100", "0120", "0140", "0160", "0180", "01A0"];
    const nextBit = ["20", "40", "60", "80", "A0"];
    for (let i = 0; i < ranges.length; i++) {
      try {
        const s = parseSupportedPids(await send(ranges[i], 4000), ranges[i]);
        s.forEach((p) => supported.add(p));
      } catch {
        break;
      }
      if (i < nextBit.length && !supported.has(nextBit[i])) break;
    }
    supportedRef.current = supported.size > 0 ? supported : null;
    setSupportedPids(supported);
  }

  // Enregistre un relevé automatiquement si les codes ont changé depuis le
  // dernier (dédup). Renvoie true si un relevé a été créé.
  async function maybeAutoSave(
    list: DiagnosticCode[],
    voltageVal: number | null
  ): Promise<boolean> {
    if (!canJournal) return false;
    const sig = list
      .map((c) => c.code)
      .sort()
      .join(",");
    const priorSig =
      lastSavedRef.current ?? [...lastReportCodes].sort().join(",");
    const hasPrior = lastReportDate != null || lastSavedRef.current != null;
    // Rien de nouveau depuis le dernier relevé → on n'enregistre pas de doublon.
    if (hasPrior && sig === priorSig) return false;
    lastSavedRef.current = sig;
    try {
      await saveDiagnosticReport(vehicleId, {
        codes: list,
        voltage: voltageVal,
        vin,
        mileage:
          live.odometer ?? (mileage ? parseInt(mileage, 10) || null : null),
      });
      return true;
    } catch {
      return false;
    }
  }

  // --- Actions de diagnostic ---------------------------------------------
  async function readCodes() {
    setBusy(true);
    setStatus("Lecture des codes défaut…");
    try {
      // Chaque mode est lu de façon TOLÉRANTE : sur K-line (ISO 9141-2) certains
      // ECU ne répondent pas aux modes 07 (en attente) / 0A (permanents) → un
      // timeout renvoie null et n'interrompt pas la lecture des codes stockés.
      const readMode = async (
        cmd: string,
        mode: "03" | "07" | "0A"
      ): Promise<string[] | null> => {
        try {
          return parseDtcCodes(await send(cmd, 8000), mode);
        } catch {
          return null;
        }
      };
      const storedRes = await readMode("03", "03");
      const pending = (await readMode("07", "07")) ?? [];
      const permanent = (await readMode("0A", "0A")) ?? [];
      const stored = storedRes ?? [];
      const seen = new Set<string>();
      const list: DiagnosticCode[] = [];
      for (const code of stored) {
        seen.add(code);
        list.push({ code, description: describeDtc(code), pending: false });
      }
      for (const code of pending) {
        if (seen.has(code)) continue;
        seen.add(code);
        list.push({ code, description: describeDtc(code), pending: true });
      }
      for (const code of permanent) {
        if (seen.has(code)) continue;
        seen.add(code);
        list.push({
          code,
          description: "Permanent — " + describeDtc(code),
          pending: false,
        });
      }
      setCodes(list);

      // Freeze frame : DTC déclencheur + instantané des capteurs au défaut.
      let hasFreeze = false;
      try {
        const fdtc = parseFreezeFrameDtc(await send("0202", 8000));
        setFreezeDtc(fdtc);
        hasFreeze = !!fdtc;
      } catch {
        setFreezeDtc(null);
      }
      if (hasFreeze) {
        const fd: Record<string, number | null> = {};
        for (const key of FREEZE_PID_KEYS) {
          const pid = LIVE_PIDS.find((p) => p.key === key);
          if (!pid) continue;
          try {
            fd[key] = parseFreezePid(pid, await send(freezeCommand(pid), 4000));
          } catch {
            fd[key] = null;
          }
        }
        setFreezeData(fd);
      } else {
        setFreezeData({});
      }
      try {
        setMonitors(parseMonitorStatus(await send("0101", 6000)));
      } catch {
        setMonitors(null);
      }
      let voltageVal: number | null = null;
      try {
        voltageVal = parseAtrvVoltage(await send("ATRV"));
        setVoltage(voltageVal);
      } catch {
        // non bloquant
      }
      setReadDone(true);
      if (storedRes === null) {
        // Le mode 03 (codes stockés) lui-même n'a pas répondu.
        setStatus(
          "Le véhicule n'a pas répondu à la demande de codes (mode 03). Réessaie, contact mis, moteur tournant."
        );
      } else {
        // Enregistrement AUTOMATIQUE dans l'historique, uniquement si les codes
        // ont changé depuis le dernier relevé (évite les doublons).
        const saved = await maybeAutoSave(list, voltageVal);
        setStatus(
          (list.length
            ? `${list.length} code(s) défaut détecté(s).`
            : "Aucun code défaut détecté 🎉") +
            (saved ? " · relevé enregistré ✓" : "")
        );
      }
    } catch (e) {
      setStatus("Erreur de lecture : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearCodes() {
    if (
      !confirm(
        "Effacer les codes défaut et éteindre le voyant moteur ?\n\nÀ ne faire qu'APRÈS avoir traité la panne : cela efface aussi les données figées utiles au diagnostic."
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus("Effacement…");
    try {
      await send("04", 9000);
      setCodes([]);
      setReadDone(false);
      setStatus("Codes effacés. Relance une lecture pour vérifier.");
    } catch (e) {
      setStatus("Échec de l'effacement : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function readVin() {
    setBusy(true);
    setStatus("Lecture du VIN…");
    try {
      const v = parseVin(await send("0902", 9000));
      if (v) {
        setVin(v);
        setStatus("VIN lu : " + v);
      } else {
        setStatus("VIN non lu (non fourni par ce véhicule).");
      }
    } catch (e) {
      setStatus("Erreur VIN : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function prefillVin() {
    if (!vin) return;
    await saveVin(vehicleId, vin);
    setStatus("VIN enregistré sur la fiche véhicule ✅");
  }

  // Extraction automatique de TOUTES les infos standard exposées par le
  // véhicule et l'adaptateur, sans avoir à connaître les commandes.
  async function probeAllInfo() {
    if (!connRef.current) return;
    setInfoBusy(true);
    setStatus("Extraction des informations véhicule…");
    const info: { label: string; value: string }[] = [];
    const add = (label: string, value: string | null | undefined) => {
      if (value) info.push({ label, value });
    };

    // Adaptateur ELM327 (identité + tension).
    try {
      add("Adaptateur", (await send("ATI", 4000)).replace(/[\r\n>]/g, " ").trim());
    } catch {
      /* non bloquant */
    }
    try {
      add("Protocole", (await send("ATDP", 4000)).replace(/[\r\n>]/g, "").trim());
    } catch {
      /* non bloquant */
    }
    try {
      const v = parseAtrvVoltage(await send("ATRV", 4000));
      if (v != null) add("Tension batterie", `${v.toFixed(1)} V`);
    } catch {
      /* non bloquant */
    }

    // Mode 09 — informations véhicule.
    try {
      const v = parseVin(await send("0902", 9000));
      if (v) {
        setVin(v);
        add("VIN (numéro de série)", v);
      }
    } catch {
      /* non bloquant */
    }
    try {
      add("Calculateur (ECU)", parseEcuName(await send("090A", 6000)));
    } catch {
      /* non bloquant */
    }
    try {
      add("Calibration ID", parseCalibrationId(await send("0904", 6000)));
    } catch {
      /* non bloquant */
    }
    try {
      add("CVN (vérif. calibration)", parseCvn(await send("0906", 6000)));
    } catch {
      /* non bloquant */
    }

    // Nombre de paramètres temps réel disponibles (déjà découverts).
    if (supportedPids.size > 0) {
      add(
        "Paramètres temps réel",
        `${supportedPids.size} disponible(s)`
      );
    }

    setVehicleInfo(info);
    setInfoBusy(false);
    setStatus(
      info.length
        ? `${info.length} information(s) récupérée(s).`
        : "Aucune information supplémentaire fournie par ce véhicule."
    );
  }

  // Recherche IA de la procédure de réinitialisation d'entretien via le VIN.
  async function runResetSearch() {
    const targetVin = vin || vehicleVin;
    if (!targetVin) return;
    setResetBusy(true);
    setResetError(null);
    try {
      const res = await resetProcedureFromVin(vehicleId, targetVin);
      if (res?.error) setResetError(res.error);
      else setResetProc(res?.procedure ?? null);
    } catch (e) {
      setResetError((e as Error).message);
    } finally {
      setResetBusy(false);
    }
  }

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR") : null;

  // Charge (ou construit) la base de connaissances du modèle. La recherche IA
  // tourne en tâche de fond côté serveur ; on lance puis on sonde le résultat
  // (évite les longues requêtes synchrones → « Failed to fetch »). `force`
  // relance une recherche même si un cache existe.
  async function loadKnowledge(force = false) {
    setKnowBusy(true);
    setKnowError(null);
    try {
      const res = await startVehicleKnowledgeResearch(vehicleId, force);
      if (!res) {
        setKnowError("Réponse vide du serveur.");
        return;
      }
      if (res.status === "ready" && res.knowledge) {
        setKnowledge(res.knowledge);
        setKnowUpdatedAt(fmtDate(res.updatedAt));
        return;
      }
      if (res.status === "none" || res.status === "unavailable") {
        if (res.error) setKnowError(res.error);
        return;
      }
      if (res.status === "error") {
        setKnowError(res.error ?? "La recherche a échoué.");
        return;
      }
      // status "pending" → recherche lancée en tâche de fond : on sonde.
      await pollKnowledge();
    } catch (e) {
      setKnowError((e as Error).message);
    } finally {
      setKnowBusy(false);
    }
  }

  // Sonde le résultat de la recherche IA (max ~3 min).
  async function pollKnowledge() {
    const maxTries = 45; // ~3 min à 4 s
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (!knowledgeAliveRef.current) return;
      let res;
      try {
        res = await getVehicleKnowledge(vehicleId);
      } catch {
        continue; // aléa réseau : on retente
      }
      if (!res) continue;
      if (res.status === "ready" && res.knowledge) {
        setKnowledge(res.knowledge);
        setKnowUpdatedAt(fmtDate(res.updatedAt));
        return;
      }
      if (res.status === "error") {
        setKnowError(res.error ?? "La recherche a échoué.");
        return;
      }
      // "pending" / "none" → on continue à sonder.
    }
    setKnowError(
      "La recherche prend plus de temps que prévu. Réessaie dans un moment avec « Mettre à jour »."
    );
  }

  // Exécute une commande spécifique de la base (ex. lecture kilométrage VW).
  async function runKnowledgeCommand(command: string) {
    const cmd = command.trim().toUpperCase();
    if (!cmd || !connRef.current) return;
    setCmdResults((r) => ({ ...r, [cmd]: "…" }));
    let res: string;
    try {
      res =
        (await send(cmd, 9000)).replace(/[\r\n>]+/g, " ").trim() ||
        "(réponse vide)";
    } catch (e) {
      res = "Erreur : " + (e as Error).message;
    }
    setCmdResults((r) => ({ ...r, [cmd]: res }));
  }

  // Console avancée : envoie une commande brute (OBD ou AT) et affiche la
  // réponse. Permet d'explorer, y compris le spécifique constructeur (mode 22).
  async function sendRaw() {
    const cmd = rawCmd.trim().toUpperCase();
    if (!cmd || !connRef.current) return;
    let res: string;
    try {
      res =
        (await send(cmd, 9000)).replace(/[\r\n>]+/g, " ").trim() || "(réponse vide)";
    } catch (e) {
      res = "Erreur : " + (e as Error).message;
    }
    setRawLog((l) => [{ cmd, res }, ...l].slice(0, 25));
  }

  // Construit l'instantané envoyé à l'IA (codes + valeurs relevées).
  function buildSnapshot(): ObdSnapshot {
    const liveArr = LIVE_PIDS.flatMap((pid) => {
      const v = live[pid.key];
      return v != null ? [{ label: pid.label, value: v, unit: pid.unit }] : [];
    });
    const freezeArr = FREEZE_PID_KEYS.flatMap((key) => {
      const pid = LIVE_PIDS.find((p) => p.key === key);
      const v = freezeData[key];
      return pid && v != null
        ? [{ label: pid.label, value: v, unit: pid.unit }]
        : [];
    });
    const monArr = monitors
      ? monitors.monitors
          .filter((m) => m.available)
          .map((m) => ({ label: m.label, complete: m.complete }))
      : [];
    return {
      codes: codes.map((c) => ({
        code: c.code,
        description: c.description,
        pending: c.pending,
      })),
      live: liveArr,
      freeze: freezeArr,
      monitors: monArr,
      milOn: monitors?.milOn ?? false,
      protocol,
      voltage,
    };
  }

  async function runAiDiagnosis() {
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await diagnoseWithAI(vehicleId, buildSnapshot());
      if (res?.error) setAiError(res.error);
      else setAiDiag(res?.diagnosis ?? null);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function saveOdometerReading() {
    const km = live.odometer;
    if (km == null) return;
    await saveOdometer(vehicleId, km);
    setOdoSaved(true);
  }

  function stopLive() {
    liveOnRef.current = false;
    setLiveOn(false);
  }

  async function startLive() {
    if (liveOnRef.current) return;
    liveOnRef.current = true;
    setLiveOn(true);
    if (liveRunningRef.current) return;
    liveRunningRef.current = true;
    // Limite l'interrogation aux PID réellement supportés (si découverts).
    const supported = supportedRef.current;
    const pids = supported
      ? LIVE_PIDS.filter((p) => supported.has(pidNumber(p.cmd)))
      : LIVE_PIDS;
    try {
      while (liveOnRef.current && connRef.current) {
        for (const pid of pids) {
          if (!liveOnRef.current) break;
          try {
            const v = parseLivePid(pid, await send(pid.cmd, 3000));
            setLive((prev) => ({ ...prev, [pid.key]: v }));
          } catch {
            // PID non supporté / timeout : on continue.
          }
        }
      }
    } finally {
      liveRunningRef.current = false;
    }
  }

  async function saveReport() {
    setBusy(true);
    try {
      const noteParts: string[] = [];
      if (protocol) noteParts.push(`Protocole : ${protocol}`);
      if (freezeDtc) noteParts.push(`Freeze frame déclenché par ${freezeDtc}`);
      if (monitors) {
        const incomplete = monitors.monitors.filter(
          (m) => m.available && !m.complete
        ).length;
        noteParts.push(
          monitors.milOn ? "Voyant moteur allumé" : "Voyant moteur éteint",
          incomplete === 0
            ? "Contrôles de préparation OK"
            : `${incomplete} contrôle(s) non prêt(s)`
        );
      }
      await saveDiagnosticReport(vehicleId, {
        codes,
        voltage,
        vin,
        mileage: mileage ? parseInt(mileage, 10) : null,
        notes: noteParts.length ? noteParts.join(" · ") : null,
      });
      setStatus("Diagnostic enregistré dans l'historique ✅");
    } catch (e) {
      setStatus("Échec de l'enregistrement : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // PID temps réel réellement affichables (définis ET supportés). Le nombre de
  // PID « supportés » inclut des états internes (bitmaps, statuts) sans tuile.
  const displayedLivePids = supportedPids.size
    ? LIVE_PIDS.filter((p) => supportedPids.has(pidNumber(p.cmd)))
    : LIVE_PIDS;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => connect()}
              disabled={busy}
              className="btn-primary disabled:opacity-60"
            >
              🔌{" "}
              {rememberedName
                ? `Connecter ${rememberedName}`
                : "Connecter l'adaptateur OBD2"}
            </button>
          ) : (
            <button
              type="button"
              onClick={disconnect}
              className="btn-secondary"
            >
              Déconnecter
            </button>
          )}
          {!connected && rememberedName && (
            <button
              type="button"
              onClick={() => connect(true)}
              disabled={busy}
              className="text-xs text-brand-600 hover:underline disabled:opacity-60"
            >
              Changer d&apos;adaptateur
            </button>
          )}
          <span
            className={`text-xs font-medium ${
              connected ? "text-green-600" : "text-gray-400"
            }`}
          >
            {connected ? "● Connecté" : "○ Non connecté"}
          </span>
          {connected && protocol && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              Protocole : {protocol}
            </span>
          )}
          {connected && ecuName && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              Calculateur : {ecuName}
            </span>
          )}
        </div>
        {status && <p className="text-sm text-gray-600">{status}</p>}
        <p className="text-[11px] text-gray-400">
          Nécessite un adaptateur <strong>ELM327 BLE</strong> (Bluetooth Low
          Energy) et un navigateur compatible Web Bluetooth (Chrome/Chromium sur
          PC et Android, Bluefy sur iOS), avec le site en HTTPS. Les adaptateurs
          ELM327 « classiques » (non BLE) ne sont pas pris en charge par le
          navigateur.
        </p>
      </div>

      {/* Base de connaissances du modèle (IA + web), toujours visible */}
      {(knowledgeAiEnabled || knowledge) && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Base de connaissances (IA)</h3>
            {knowledgeAiEnabled && hasVehicleIdentity && (
              <button
                type="button"
                onClick={() => loadKnowledge(true)}
                disabled={knowBusy}
                className="btn-secondary px-3 py-1 text-sm disabled:opacity-60"
              >
                {knowBusy
                  ? "Recherche…"
                  : knowledge
                    ? "Mettre à jour"
                    : "Rechercher"}
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            Connaissances propres au modèle (pannes fréquentes, commandes
            constructeur, procédures) recherchées sur le web par l&apos;IA,
            mémorisées et enrichies à chaque connexion, puis réutilisées pour les
            diagnostics.
          </p>

          {!hasVehicleIdentity && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Renseigne la marque, le modèle et l&apos;année du véhicule pour
              construire sa base de connaissances.
            </p>
          )}
          {knowBusy && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Recherche IA en cours… ça peut prendre 1 à 2 minutes (tu peux
              continuer à utiliser le diagnostic pendant ce temps).
            </p>
          )}
          {knowError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {knowError}
            </p>
          )}

          {knowledge && (
            <div className="space-y-3">
              {knowledge.vehicle && (
                <p className="text-sm font-medium text-gray-800">
                  {knowledge.vehicle}
                  {knowUpdatedAt && (
                    <span className="ml-2 text-[11px] font-normal text-gray-400">
                      (mis à jour le {knowUpdatedAt})
                    </span>
                  )}
                </p>
              )}
              {knowledge.summary && (
                <p className="text-sm text-gray-600">{knowledge.summary}</p>
              )}

              {/* Commandes spécifiques constructeur, exécutables */}
              {knowledge.obdCommands.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">
                    Commandes spécifiques (ex. lecture kilométrage)
                  </p>
                  {knowledge.obdCommands.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-200 p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium">
                            {c.label || "Commande"}
                          </span>{" "}
                          <span className="font-mono text-xs text-brand-700">
                            {c.command}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => runKnowledgeCommand(c.command)}
                          disabled={!connected || busy || !c.command}
                          className="btn-secondary px-3 py-1 text-xs disabled:opacity-60"
                          title={
                            connected
                              ? undefined
                              : "Connecte l'adaptateur pour tester"
                          }
                        >
                          Tester
                        </button>
                      </div>
                      {c.description && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {c.description}
                        </p>
                      )}
                      {cmdResults[c.command.trim().toUpperCase()] && (
                        <p className="mt-1 break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700">
                          → {cmdResults[c.command.trim().toUpperCase()]}
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-400">
                    Commandes constructeur indicatives : certaines nécessitent une
                    adresse ECU précise et peuvent ne rien renvoyer.
                  </p>
                </div>
              )}

              {/* Pannes fréquentes */}
              {knowledge.commonFaults.length > 0 && (
                <details className="rounded-lg border border-gray-200 p-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Pannes fréquentes ({knowledge.commonFaults.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {knowledge.commonFaults.map((f, i) => (
                      <li key={i} className="text-sm">
                        {f.code && (
                          <span className="font-mono font-semibold">
                            {f.code}{" "}
                          </span>
                        )}
                        <span className="font-medium">{f.title}</span>
                        {f.description && (
                          <span className="text-gray-600"> — {f.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Procédures */}
              {knowledge.resetProcedures.length > 0 && (
                <details className="rounded-lg border border-gray-200 p-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Procédures ({knowledge.resetProcedures.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {knowledge.resetProcedures.map((p, i) => (
                      <div key={i}>
                        <p className="text-sm font-medium">{p.title}</p>
                        {p.steps.length > 0 && (
                          <ol className="list-decimal pl-5 text-sm text-gray-700">
                            {p.steps.map((s, j) => (
                              <li key={j}>{s}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {knowledge.tips.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                  {knowledge.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}

              {knowledge.sources.length > 0 && (
                <div className="text-[11px] text-gray-500">
                  <span className="font-medium">Sources : </span>
                  {knowledge.sources.map((s, i) => (
                    <span key={i}>
                      {i > 0 && " · "}
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:underline"
                        >
                          {s.title || s.url}
                        </a>
                      ) : (
                        s.title
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {connected && (
        <>
          {/* Codes défaut */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Codes défaut</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={readCodes}
                  disabled={busy}
                  className="btn-secondary px-3 py-1 text-sm disabled:opacity-60"
                >
                  Lire
                </button>
                <button
                  type="button"
                  onClick={clearCodes}
                  disabled={busy}
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Effacer
                </button>
              </div>
            </div>

            {monitors && (
              <div className="rounded-lg border border-gray-200 p-2 text-sm">
                <p className="mb-1 font-medium">
                  Voyant moteur :{" "}
                  {monitors.milOn ? (
                    <span className="text-red-600">allumé ⚠️</span>
                  ) : (
                    <span className="text-green-600">éteint</span>
                  )}
                  {monitors.dtcCount > 0 && (
                    <span className="text-gray-500">
                      {" "}
                      · {monitors.dtcCount} DTC signalé(s)
                    </span>
                  )}
                </p>
                {readDone && freezeDtc && (
                  <p className="mb-1 text-xs text-gray-500">
                    Freeze frame déclenché par{" "}
                    <span className="font-mono">{freezeDtc}</span>
                  </p>
                )}
                <p className="mt-1 text-xs font-medium text-gray-600">
                  Préparation au contrôle technique
                </p>
                <ul className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
                  {monitors.monitors
                    .filter((m) => m.available)
                    .map((m) => (
                      <li
                        key={m.key}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-600">{m.label}</span>
                        <span
                          className={
                            m.complete ? "text-green-600" : "text-amber-600"
                          }
                        >
                          {m.complete ? "prêt ✓" : "non prêt"}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {Object.keys(freezeData).length > 0 && (
              <div className="rounded-lg border border-gray-200 p-2 text-sm">
                <p className="mb-1 text-xs font-medium text-gray-600">
                  Freeze frame — état des capteurs au moment du défaut
                </p>
                <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
                  {FREEZE_PID_KEYS.map((key) => {
                    const pid = LIVE_PIDS.find((p) => p.key === key);
                    const v = freezeData[key];
                    if (!pid || v == null) return null;
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-600">{pid.label}</span>
                        <span className="font-medium text-gray-800">
                          {v} {pid.unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {readDone &&
              lastReportDate &&
              (() => {
                const currentSet = new Set(codes.map((c) => c.code));
                const newCodes = codes
                  .map((c) => c.code)
                  .filter((c) => !lastReportCodes.includes(c));
                const resolved = lastReportCodes.filter(
                  (c) => !currentSet.has(c)
                );
                if (newCodes.length === 0 && resolved.length === 0) {
                  return (
                    <p className="text-xs text-gray-500">
                      Aucun changement depuis le dernier relevé ({lastReportDate}
                      ).
                    </p>
                  );
                }
                return (
                  <div className="flex flex-wrap items-center gap-1">
                    {newCodes.map((c) => (
                      <span
                        key={`n-${c}`}
                        className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-800"
                      >
                        ▲ {c} nouveau
                      </span>
                    ))}
                    {resolved.map((c) => (
                      <span
                        key={`s-${c}`}
                        className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-800"
                      >
                        ▼ {c} résolu
                      </span>
                    ))}
                    <span className="text-[11px] text-gray-400">
                      depuis le {lastReportDate}
                    </span>
                  </div>
                );
              })()}

            {readDone && codes.length === 0 && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Aucun code défaut. 🎉
              </p>
            )}
            {codes.length > 0 && (
              <ul className="space-y-2">
                {codes.map((c) => (
                  <li
                    key={c.code}
                    className="rounded-lg border border-gray-200 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{c.code}</span>
                      {c.pending && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                          en attente
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{c.description}</p>
                  </li>
                ))}
              </ul>
            )}
            {voltage != null && (
              <p className="text-xs text-gray-500">
                Tension batterie : <strong>{voltage.toFixed(1)} V</strong>
              </p>
            )}

            {aiEnabled && readDone && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={runAiDiagnosis}
                  disabled={aiBusy}
                  className="btn-primary disabled:opacity-60"
                >
                  {aiBusy ? "Analyse IA en cours…" : "🤖 Aide au diagnostic (IA)"}
                </button>
                {aiError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {aiError}
                  </p>
                )}
                {aiDiag && (
                  <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge border ${SEVERITY_STYLE[aiDiag.severity]}`}
                      >
                        {aiDiag.severity}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {aiDiag.summary}
                      </span>
                    </div>
                    {aiDiag.causes.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-600">
                          Causes probables
                        </p>
                        {aiDiag.causes.map((cause, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-gray-200 bg-white p-2"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[11px] ${
                                  LIKELIHOOD_STYLE[cause.likelihood] ??
                                  LIKELIHOOD_STYLE.moyenne
                                }`}
                              >
                                {cause.likelihood}
                              </span>
                              <span className="text-sm font-medium">
                                {cause.title}
                              </span>
                            </div>
                            {cause.checks.length > 0 && (
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                                {cause.checks.map((chk, j) => (
                                  <li key={j}>{chk}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {aiDiag.advice && (
                      <p className="text-sm text-gray-700">{aiDiag.advice}</p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Analyse générée par IA à partir des données OBD — indicative,
                      ne remplace pas un diagnostic professionnel.
                    </p>
                  </div>
                )}
              </div>
            )}

            {canJournal && readDone && (
              <div className="space-y-1 border-t border-gray-100 pt-3">
                <p className="text-[11px] text-gray-400">
                  Chaque lecture est enregistrée automatiquement quand les codes
                  changent. Tu peux aussi forcer un relevé avec un kilométrage
                  précis :
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="label">Compteur (km)</label>
                    <input
                      type="number"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      className="input w-32"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveReport}
                    disabled={busy}
                    className="btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                  >
                    Enregistrer un relevé
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Données temps réel */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Données temps réel</h3>
              {!liveOn ? (
                <button
                  type="button"
                  onClick={startLive}
                  className="btn-secondary px-3 py-1 text-sm"
                >
                  Démarrer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLive}
                  className="btn-secondary px-3 py-1 text-sm"
                >
                  Arrêter
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {displayedLivePids.map((pid) => {
                const v = live[pid.key];
                return (
                  <div
                    key={pid.key}
                    className="rounded-lg border border-gray-200 p-2 text-center"
                  >
                    <div className="text-lg font-bold">
                      {v == null ? "—" : v}
                      <span className="ml-0.5 text-xs font-normal text-gray-400">
                        {v == null ? "" : pid.unit}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500">{pid.label}</div>
                  </div>
                );
              })}
            </div>
            {canSaveMileage && live.odometer != null && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                <span className="text-sm">
                  Odomètre lu :{" "}
                  <strong>{live.odometer.toLocaleString("fr-FR")} km</strong>
                </span>
                <button
                  type="button"
                  onClick={saveOdometerReading}
                  className="btn-secondary px-3 py-1 text-sm"
                >
                  Enregistrer le km sur la fiche
                </button>
                {odoSaved && (
                  <span className="text-xs text-green-600">enregistré ✓</span>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              {displayedLivePids.length} mesure(s) affichée(s)
              {supportedPids.size > displayedLivePids.length
                ? ` sur ${supportedPids.size} paramètre(s) détecté(s) — les autres sont des états internes (bitmaps, statuts) sans valeur à afficher`
                : ""}
              .
            </p>
          </div>

          {/* Informations véhicule (extraction automatique) */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Informations véhicule</h3>
              <button
                type="button"
                onClick={probeAllInfo}
                disabled={infoBusy || busy}
                className="btn-secondary px-3 py-1 text-sm disabled:opacity-60"
              >
                {infoBusy ? "Lecture…" : "Tout récupérer"}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Interroge automatiquement toutes les informations standard fournies
              par le véhicule et l&apos;adaptateur (identité, calculateur,
              calibration…), sans avoir à connaître les commandes.
            </p>
            {vehicleInfo.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {vehicleInfo.map((it, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-sm"
                  >
                    <span className="text-gray-500">{it.label}</span>
                    <span className="break-all font-mono text-gray-800">
                      {it.value}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* VIN */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Numéro de série (VIN)</h3>
              <button
                type="button"
                onClick={readVin}
                disabled={busy}
                className="btn-secondary px-3 py-1 text-sm disabled:opacity-60"
              >
                Lire le VIN
              </button>
            </div>
            {vin ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{vin}</span>
                  {(() => {
                    const stored = vehicleVin?.trim().toUpperCase();
                    const read = vin.trim().toUpperCase();
                    if (stored && stored === read) {
                      return (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] text-green-800">
                          ✓ Identique à la fiche
                        </span>
                      );
                    }
                    if (stored && stored !== read) {
                      return (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                          ⚠️ Différent de la fiche ({vehicleVin})
                        </span>
                      );
                    }
                    return (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        Non renseigné sur la fiche
                      </span>
                    );
                  })()}
                </div>
                {canEditVehicle &&
                  vehicleVin?.trim().toUpperCase() !== vin.trim().toUpperCase() && (
                    <button
                      type="button"
                      onClick={prefillVin}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      {vehicleVin
                        ? "Mettre à jour le VIN de la fiche"
                        : "Renseigner le VIN sur la fiche"}
                    </button>
                  )}
              </>
            ) : (
              vehicleVin && (
                <p className="text-sm text-gray-500">
                  VIN sur la fiche :{" "}
                  <span className="font-mono">{vehicleVin}</span>
                </p>
              )
            )}

            {/* Procédure de réinitialisation d'entretien (IA + VIN) */}
            {resetAiEnabled && (vin || vehicleVin) && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={runResetSearch}
                  disabled={resetBusy}
                  className="btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                >
                  {resetBusy
                    ? "Recherche en cours…"
                    : "🔧 Procédure de réinitialisation d'entretien (IA)"}
                </button>
                <p className="text-[11px] text-gray-400">
                  Recherche sur le web, à partir du VIN, comment réinitialiser le
                  rappel d&apos;entretien / voyant de vidange après un entretien.
                </p>
                {resetError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {resetError}
                  </p>
                )}
                {resetProc && (
                  <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
                    {resetProc.vehicle && (
                      <p className="text-sm font-medium text-gray-800">
                        {resetProc.vehicle}
                      </p>
                    )}
                    {resetProc.resets && (
                      <p className="text-xs text-gray-600">
                        Réinitialise : {resetProc.resets}
                      </p>
                    )}
                    {resetProc.steps.length > 0 ? (
                      <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                        {resetProc.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    ) : (
                      !resetProc.found && (
                        <p className="text-sm text-gray-600">
                          Aucune procédure fiable trouvée pour ce véhicule.
                        </p>
                      )
                    )}
                    {resetProc.caution && (
                      <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        ⚠️ {resetProc.caution}
                      </p>
                    )}
                    {resetProc.sources.length > 0 && (
                      <div className="text-[11px] text-gray-500">
                        <p className="font-medium">Sources :</p>
                        <ul className="list-disc pl-4">
                          {resetProc.sources.map((src, i) => (
                            <li key={i}>
                              {src.url ? (
                                <a
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-600 hover:underline"
                                >
                                  {src.title || src.url}
                                </a>
                              ) : (
                                src.title
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Procédure indicative issue du web — vérifie toujours avec le
                      carnet d&apos;entretien du constructeur.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Console avancée */}
          <details className="card">
            <summary className="cursor-pointer font-semibold">
              Console avancée (commandes brutes)
            </summary>
            <p className="mt-2 text-xs text-gray-500">
              Envoie une commande OBD (ex. <code>0105</code>, <code>03</code>) ou
              ELM327 (ex. <code>ATRV</code>, <code>ATDP</code>), ou du spécifique
              constructeur (ex. <code>22F190</code> lecture par identifiant). La
              réponse brute s&apos;affiche telle quelle.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={rawCmd}
                onChange={(e) => setRawCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendRaw();
                }}
                placeholder="ex. 0105 ou ATRV"
                className="input font-mono text-sm"
              />
              <button
                type="button"
                onClick={sendRaw}
                disabled={busy}
                className="btn-secondary shrink-0 disabled:opacity-60"
              >
                Envoyer
              </button>
            </div>
            {rawLog.length > 0 && (
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
                {rawLog.map((entry, i) => (
                  <div key={i}>
                    <span className="text-brand-700">&gt; {entry.cmd}</span>
                    <span className="ml-2 text-gray-700">{entry.res}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-gray-400">
              Mode avancé : certaines commandes constructeur sont propres à la
              marque et peuvent ne rien renvoyer (ou nécessiter une adresse ECU
              précise). Sans danger en lecture ; évite les commandes d&apos;écriture.
            </p>
          </details>
        </>
      )}

      <p className="text-[11px] text-gray-400">
        ⚠️ Outil d&apos;aide indicatif. La lecture des codes ne remplace pas un
        diagnostic professionnel ; les libellés sont génériques et peuvent
        différer selon le constructeur. N&apos;efface les codes qu&apos;après
        avoir traité la cause.
      </p>
    </div>
  );
}
