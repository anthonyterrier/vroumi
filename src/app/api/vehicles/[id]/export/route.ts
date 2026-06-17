import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import {
  maintenanceTypeLabel,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/labels";
import { format } from "date-fns";

/** Échappe une valeur pour le format CSV (RFC 4180). */
function csv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: unknown[]): string {
  return values.map(csv).join(";");
}

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
    prisma.fuelEntry.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { filledAt: "desc" },
    }),
    prisma.document.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mileageEntry.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { readAt: "desc" },
    }),
  ]);

  const d = (date: Date | null) => (date ? format(date, "yyyy-MM-dd") : "");
  const lines: string[] = [];

  lines.push(row(["Catégorie", "Date", "Détail", "Kilométrage", "Coût (€)", "Lieu / notes"]));

  for (const m of maint) {
    lines.push(
      row([
        "Entretien",
        d(m.performedAt),
        m.title ? `${maintenanceTypeLabel(m)} — ${m.title}` : maintenanceTypeLabel(m),
        m.mileage ?? "",
        m.cost ?? "",
        [m.serviceName, m.notes].filter(Boolean).join(" — "),
      ])
    );
  }
  for (const r of repairs) {
    lines.push(
      row([
        "Réparation",
        d(r.performedAt),
        r.title,
        r.mileage ?? "",
        r.cost ?? "",
        [r.serviceName, r.underWarranty ? "sous garantie" : "", r.notes]
          .filter(Boolean)
          .join(" — "),
      ])
    );
  }
  for (const f of fuel) {
    lines.push(
      row([
        "Carburant",
        d(f.filledAt),
        `${f.liters} L${f.fullTank ? " (plein)" : " (partiel)"}`,
        f.mileage ?? "",
        f.totalCost ?? "",
        [f.station, f.notes].filter(Boolean).join(" — "),
      ])
    );
  }
  for (const doc of docs) {
    lines.push(
      row([
        "Document",
        d(doc.issuedAt),
        `${DOCUMENT_TYPE_LABELS[doc.type]}${doc.label ? ` — ${doc.label}` : ""}`,
        "",
        doc.cost ?? "",
        [
          doc.provider,
          doc.expiresAt ? `expire le ${d(doc.expiresAt)}` : "",
          doc.notes,
        ]
          .filter(Boolean)
          .join(" — "),
      ])
    );
  }
  for (const mi of mileage) {
    lines.push(
      row(["Relevé km", d(mi.readAt), "Relevé kilométrique", mi.mileage, "", mi.notes ?? ""])
    );
  }

  // BOM UTF-8 pour qu'Excel ouvre correctement les accents.
  const body = "﻿" + lines.join("\r\n");
  const filename = `vroumi-${(vehicle.name || "vehicule").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
