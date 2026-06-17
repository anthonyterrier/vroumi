import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Mappe un libellé de carburant (NHTSA ou API plaque) vers notre enum FuelType.
function mapFuel(f?: string | null): string | null {
  if (!f) return null;
  const s = String(f).toLowerCase();
  if (s.includes("diesel") || s.includes("gazole")) return "DIESEL";
  if (s.includes("electric") || s.includes("électr")) return "ELECTRIC";
  if (s.includes("hybrid") || s.includes("hybride")) return "HYBRID";
  if (s.includes("lpg") || s.includes("gpl") || s.includes("propane")) return "LPG";
  if (s.includes("gasoline") || s.includes("petrol") || s.includes("essence"))
    return "GASOLINE";
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Recherche, insensible à la casse, d'une clé parmi plusieurs dans un objet. */
function pick(obj: Record<string, unknown>, ...keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function extractYear(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

export async function GET(req: Request) {
  // Endpoint réservé aux utilisateurs connectés (évite un proxy ouvert).
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const vin = searchParams.get("vin")?.trim();
  const plate = searchParams.get("plate")?.trim();

  // --- VIN : API publique NHTSA vPIC (gratuite, sans clé) ---
  if (vin) {
    if (vin.length < 11) {
      return NextResponse.json(
        { error: "VIN trop court (17 caractères attendus)." },
        { status: 400 }
      );
    }
    try {
      const r = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
          vin
        )}?format=json`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error("upstream");
      const d = (await r.json())?.Results?.[0] ?? {};
      const make =
        (d.Make && titleCase(d.Make)) ||
        (d.Manufacturer && titleCase(d.Manufacturer)) ||
        null;
      return NextResponse.json({
        source: "vin",
        make,
        model: d.Model || null,
        year: d.ModelYear ? parseInt(d.ModelYear, 10) : null,
        fuelType: mapFuel(d.FuelTypePrimary),
        info:
          [d.VehicleType, d.PlantCountry].filter(Boolean).join(" · ") || null,
      });
    } catch {
      return NextResponse.json(
        { error: "Service de décodage VIN indisponible." },
        { status: 502 }
      );
    }
  }

  // --- Plaque : API tierce payante (clé requise) ---
  if (plate) {
    const key = process.env.PLATE_API_KEY;
    if (!key) {
      return NextResponse.json(
        {
          error:
            "Recherche par plaque non configurée : ajoutez PLATE_API_KEY dans .env (voir docs).",
        },
        { status: 501 }
      );
    }
    // URL configurable ({plate} et {token} sont remplacés). Par défaut :
    // apiplaqueimmatriculation.com (API SIV française).
    const template =
      process.env.PLATE_API_URL ||
      "https://api.apiplaqueimmatriculation.com/get?immatriculation={plate}&token={token}";
    const url = template
      .replace("{plate}", encodeURIComponent(plate.replace(/[\s-]/g, "")))
      .replace("{token}", encodeURIComponent(key));
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      // Les fournisseurs imbriquent souvent les données sous data/result/vehicule.
      const data = (j?.data ?? j?.result ?? j?.vehicule ?? j) as Record<
        string,
        unknown
      >;
      const make = pick(data, "marque", "make", "brand");
      const model = pick(data, "modele", "model", "version", "type_commercial");
      const fuel = mapFuel(pick(data, "energie", "carburant", "fuel"));
      const year = extractYear(
        pick(
          data,
          "annee",
          "millesime",
          "date1MiseCirculation",
          "date_premiere_immatriculation",
          "datePremiereCirculation"
        )
      );
      if (!make && !model) {
        return NextResponse.json(
          {
            error:
              "Aucune donnée exploitable renvoyée par l'API plaque (vérifiez la clé et le format du fournisseur).",
          },
          { status: 502 }
        );
      }
      return NextResponse.json({ source: "plate", make, model, year, fuelType: fuel });
    } catch {
      return NextResponse.json(
        { error: "Service de recherche par plaque indisponible." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { error: "Fournissez un paramètre vin ou plate." },
    { status: 400 }
  );
}
