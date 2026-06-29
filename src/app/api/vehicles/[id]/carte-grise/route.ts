import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { getEffectiveVehiclePerms } from "@/lib/perms";
import { prisma } from "@/lib/prisma";

/**
 * Sert la photo de la carte grise d'un véhicule. Réservée au droit
 * `registrationView` (par défaut : propriétaire du garage uniquement).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, vehicle } = await requireVehicle(id);

  const perms = await getEffectiveVehiclePerms(user.id, vehicle.id);
  if (!perms.registrationView) {
    return new NextResponse("Accès restreint", { status: 403 });
  }

  const reg = await prisma.vehicleRegistration.findUnique({
    where: { vehicleId: vehicle.id },
  });
  if (!reg) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(reg.data), {
    headers: {
      "Content-Type": reg.mimeType,
      // Document sensible : pas de mise en cache partagée.
      "Cache-Control": "private, no-store",
    },
  });
}
