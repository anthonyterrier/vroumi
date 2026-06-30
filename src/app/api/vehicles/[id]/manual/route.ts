import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";

/** Sert le fichier du manuel (accessible à tout membre du véhicule). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const manual = await prisma.vehicleManual.findUnique({
    where: { vehicleId: vehicle.id },
  });
  if (!manual?.data || !manual.mimeType) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(manual.data), {
    headers: {
      "Content-Type": manual.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
