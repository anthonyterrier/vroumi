"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Aperçu" },
  { slug: "maintenance", label: "Entretiens" },
  { slug: "repairs", label: "Réparations" },
  { slug: "fuel", label: "Carburant" },
  { slug: "mileage", label: "Kilométrage" },
  { slug: "documents", label: "Documents" },
  { slug: "reminders", label: "Rappels" },
  { slug: "diagnostic", label: "Diagnostic" },
  { slug: "costs", label: "Coûts", perm: "costs" as const },
  { slug: "edit", label: "Profil", perm: "edit" as const },
];

export function VehicleTabs({
  vehicleId,
  canViewCosts = true,
  canEdit = true,
}: {
  vehicleId: string;
  canViewCosts?: boolean;
  canEdit?: boolean;
}) {
  const pathname = usePathname();
  const base = `/vehicles/${vehicleId}`;
  const tabs = TABS.filter((t) =>
    t.perm === "costs" ? canViewCosts : t.perm === "edit" ? canEdit : true
  );

  return (
    <nav className="-mx-4 mb-4 overflow-x-auto px-4">
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {tabs.map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active =
            tab.slug === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={tab.slug}
              href={href}
              className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-b-2 border-brand-600 text-brand-700"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
