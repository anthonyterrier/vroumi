import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import {
  maintenanceTypeLabel,
  DOCUMENT_TYPE_LABELS,
  FUEL_TYPE_LABELS,
} from "@/lib/labels";
import { format } from "date-fns";

const EUR = (n: number | null | undefined) =>
  n == null ? "-" : `${n.toLocaleString("fr-FR")} EUR`;
const KM = (n: number | null | undefined) =>
  n == null ? "-" : `${n.toLocaleString("fr-FR")} km`;
const D = (d: Date | null | undefined) => (d ? format(d, "dd/MM/yyyy") : "-");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [maint, repairs, fuel, docs, mileage] = await Promise.all([
    prisma.maintenance.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
    }),
    prisma.repair.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { performedAt: "desc" },
    }),
    prisma.fuelEntry.findMany({ where: { vehicleId: vehicle.id } }),
    prisma.document.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { expiresAt: "asc" },
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

  const maintTotal = maint.reduce((s, m) => s + (m.cost ?? 0), 0);
  const repairTotal = repairs.reduce((s, r) => s + (r.cost ?? 0), 0);
  const fuelTotal = fuel.reduce((s, f) => s + (f.totalCost ?? 0), 0);
  const docTotal = docs.reduce((s, d) => s + (d.cost ?? 0), 0);
  const grandTotal = maintTotal + repairTotal + fuelTotal + docTotal;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]); // A4
  const margin = 50;
  let y = 792;
  const green = rgb(0.12, 0.43, 0.26);
  const gray = rgb(0.4, 0.4, 0.4);

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = pdf.addPage([595, 842]);
      y = 792;
    }
  }

  function text(
    s: string,
    x: number,
    size = 10,
    f: PDFFont = font,
    color = rgb(0, 0, 0)
  ) {
    page.drawText(s, { x, y, size, font: f, color });
  }

  function heading(s: string) {
    ensureSpace(30);
    y -= 6;
    text(s, margin, 13, bold, green);
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: 545, y },
      thickness: 0.5,
      color: green,
    });
    y -= 16;
  }

  // En-tête
  text("Carnet d'entretien", margin, 20, bold, green);
  y -= 26;
  text(vehicle.name, margin, 15, bold);
  y -= 18;
  text(
    [
      [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" "),
      FUEL_TYPE_LABELS[vehicle.fuelType],
      vehicle.plate,
    ]
      .filter(Boolean)
      .join("  -  "),
    margin,
    10,
    font,
    gray
  );
  y -= 14;
  text(
    `Kilometrage : ${KM(mileage)}   -   Edite le ${format(new Date(), "dd/MM/yyyy")}`,
    margin,
    10,
    font,
    gray
  );
  y -= 20;

  // Synthèse des coûts
  heading("Synthese des couts");
  const rows: [string, string][] = [
    ["Entretiens", EUR(maintTotal)],
    ["Reparations", EUR(repairTotal)],
    ["Carburant", EUR(fuelTotal)],
    ["Documents", EUR(docTotal)],
    ["TOTAL", EUR(grandTotal)],
  ];
  for (const [label, value] of rows) {
    ensureSpace(16);
    const isTotal = label === "TOTAL";
    text(label, margin, 10, isTotal ? bold : font);
    text(value, 460, 10, isTotal ? bold : font);
    y -= 15;
  }
  y -= 8;

  // Entretiens
  heading("Entretiens");
  if (maint.length === 0) {
    text("Aucun entretien enregistre.", margin, 10, font, gray);
    y -= 16;
  } else {
    for (const m of maint) {
      ensureSpace(16);
      text(D(m.performedAt), margin, 9, font, gray);
      text(
        (m.title || maintenanceTypeLabel(m)).slice(0, 50),
        120,
        9,
        font
      );
      text(KM(m.mileage), 380, 9, font, gray);
      text(EUR(m.cost), 470, 9, font);
      y -= 14;
    }
  }
  y -= 8;

  // Réparations
  heading("Reparations");
  if (repairs.length === 0) {
    text("Aucune reparation enregistree.", margin, 10, font, gray);
    y -= 16;
  } else {
    for (const r of repairs) {
      ensureSpace(16);
      text(D(r.performedAt), margin, 9, font, gray);
      text(r.title.slice(0, 50), 120, 9, font);
      text(KM(r.mileage), 380, 9, font, gray);
      text(EUR(r.cost), 470, 9, font);
      y -= 14;
    }
  }
  y -= 8;

  // Documents & échéances
  heading("Documents et echeances");
  if (docs.length === 0) {
    text("Aucun document enregistre.", margin, 10, font, gray);
    y -= 16;
  } else {
    for (const d of docs) {
      ensureSpace(16);
      text(
        `${DOCUMENT_TYPE_LABELS[d.type]}${d.label ? ` - ${d.label}` : ""}`.slice(0, 45),
        margin,
        9,
        font
      );
      text(d.provider ? d.provider.slice(0, 24) : "", 320, 9, font, gray);
      text(d.expiresAt ? `expire ${D(d.expiresAt)}` : "", 440, 9, font, gray);
      y -= 14;
    }
  }

  // Pied de page sur la dernière page
  ensureSpace(40);
  y = margin - 10 < y ? y : margin;
  page.drawText(
    "Document genere par Vroumi - valeurs indicatives, a verifier.",
    { x: margin, y: 30, size: 8, font, color: gray }
  );

  const bytes = await pdf.save();
  const filename = `rapport-${(vehicle.name || "vehicule")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
