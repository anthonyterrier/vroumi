"use client";

import { useRef, useState } from "react";
import {
  LIVE_PIDS,
  parseDtcCodes,
  parseLivePid,
  parseVin,
  parseAtrvVoltage,
  parseSupportedPids,
  parseMonitorStatus,
  parseFreezeFrameDtc,
  pidNumber,
  type MonitorStatus,
} from "@/lib/obd";
import { describeDtc } from "@/lib/dtc-codes";
import {
  saveVin,
  saveDiagnosticReport,
  type DiagnosticCode,
} from "@/app/(app)/vehicles/[id]/diagnostic-actions";

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
  currentMileage,
}: {
  vehicleId: string;
  canEditVehicle: boolean;
  canJournal: boolean;
  currentMileage: number | null;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [codes, setCodes] = useState<DiagnosticCode[]>([]);
  const [freezeDtc, setFreezeDtc] = useState<string | null>(null);
  const [monitors, setMonitors] = useState<MonitorStatus | null>(null);
  const [readDone, setReadDone] = useState(false);
  const [vin, setVin] = useState<string | null>(null);
  const [voltage, setVoltage] = useState<number | null>(null);
  const [live, setLive] = useState<Record<string, number | null>>({});
  const [liveOn, setLiveOn] = useState(false);
  const [mileage, setMileage] = useState<string>(
    currentMileage != null ? String(currentMileage) : ""
  );

  const connRef = useRef<Conn | null>(null);
  const liveOnRef = useRef(false);
  const liveRunningRef = useRef(false);
  // PID mode 01 supportés par le véhicule (null = pas encore découverts).
  const supportedRef = useRef<Set<string> | null>(null);

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

  async function connect() {
    if (!("bluetooth" in navigator) || !window.isSecureContext) {
      setStatus(
        "Web Bluetooth indisponible : utilise Chrome/Chromium (PC, Android) ou Bluefy (iOS), et accède au site en HTTPS."
      );
      return;
    }
    setBusy(true);
    setStatus("Connexion à l'adaptateur…");
    const bt = (navigator as unknown as { bluetooth: BtLike }).bluetooth;
    const orig = bt.requestDevice.bind(bt);
    bt.requestDevice = async () => {
      try {
        const saved = localStorage.getItem(DEVICE_ID_KEY);
        if (saved && bt.getDevices) {
          const known = await bt.getDevices();
          const d = known.find((x) => x.id === saved);
          if (d) return d;
        }
      } catch {
        // getDevices / localStorage indisponible → sélection manuelle.
      }
      const d = await orig({
        acceptAllDevices: true,
        optionalServices: OBD_SERVICES,
      });
      try {
        localStorage.setItem(DEVICE_ID_KEY, d.id);
      } catch {
        // stockage indisponible : sans conséquence.
      }
      return d;
    };

    try {
      let device: BtDevice;
      try {
        device = await bt.requestDevice();
      } finally {
        bt.requestDevice = orig;
      }
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
      // Découvre les PID mode 01 supportés (pour n'interroger que l'utile).
      await discoverSupportedPids();

      setConnected(true);
      setStatus("Connecté ✅ — prêt pour le diagnostic.");
    } catch (e) {
      setStatus("Connexion impossible : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
    for (const base of ["0100", "0120", "0140", "0160"]) {
      try {
        const s = parseSupportedPids(await send(base, 4000), base);
        s.forEach((p) => supported.add(p));
        // Le bit du dernier PID de la plage indique la présence de la suivante ;
        // en pratique on interroge les 4 premières plages, suffisant ici.
      } catch {
        break;
      }
    }
    supportedRef.current = supported.size > 0 ? supported : null;
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

      // Freeze frame (DTC déclencheur) et état des contrôles de préparation.
      try {
        setFreezeDtc(parseFreezeFrameDtc(await send("0202", 8000)));
      } catch {
        setFreezeDtc(null);
      }
      try {
        setMonitors(parseMonitorStatus(await send("0101", 6000)));
      } catch {
        setMonitors(null);
      }
      try {
        setVoltage(parseAtrvVoltage(await send("ATRV")));
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
        setStatus(
          list.length
            ? `${list.length} code(s) défaut détecté(s).`
            : "Aucun code défaut détecté 🎉"
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

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="btn-primary disabled:opacity-60"
            >
              🔌 Connecter l&apos;adaptateur OBD2
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

            {canJournal && readDone && (
              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
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
                  className="btn-primary px-3 py-2 text-sm disabled:opacity-60"
                >
                  Enregistrer dans l&apos;historique
                </button>
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
              {LIVE_PIDS.map((pid) => {
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
            {vin && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{vin}</span>
                {canEditVehicle && (
                  <button
                    type="button"
                    onClick={prefillVin}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    Enregistrer sur la fiche
                  </button>
                )}
              </div>
            )}
          </div>
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
