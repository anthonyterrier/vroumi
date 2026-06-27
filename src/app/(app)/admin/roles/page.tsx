import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  getAllRolePerms,
  PERM_CRUD_GROUPS,
  PERM_MODULE_KEYS,
  ROLE_KEYS,
  type PermKey,
  type RoleKey,
} from "@/lib/perms";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { saveRolePerms, resetRolePerms } from "@/app/(app)/admin/actions";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  PERM_FEATURE_LABELS,
  PERM_MODULE_LABELS,
  permActionLabel,
} from "@/lib/labels";

function PermCheckbox({
  perm,
  label,
  checked,
}: {
  perm: PermKey;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="perm"
        value={perm}
        defaultChecked={checked}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span>{label}</span>
    </label>
  );
}

export default async function RolesPage() {
  await requireAdmin();
  const all = await getAllRolePerms();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Droits par rôle</h1>
        <Link href="/admin" className="text-sm text-brand-600 hover:underline">
          ← Administration
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        Cochez les droits accordés à chaque rôle. Ces réglages remplacent les
        droits par défaut. « Réinitialiser » rétablit les valeurs par défaut.
      </p>

      {ROLE_KEYS.map((role: RoleKey) => {
        const perms = all[role];
        return (
          <section key={role} className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{ROLE_LABELS[role]}</h2>
                <p className="text-xs text-gray-400">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>
              <form action={resetRolePerms.bind(null, role)}>
                <DeleteButton
                  label="Réinitialiser"
                  confirmMessage={`Rétablir les droits par défaut pour ${ROLE_LABELS[role]} ?`}
                  className="text-xs text-gray-500 hover:underline"
                />
              </form>
            </div>

            <form action={saveRolePerms.bind(null, role)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {PERM_CRUD_GROUPS.map((group) => (
                  <div key={group.feature} className="space-y-1.5">
                    <p className="text-sm font-medium text-gray-700">
                      {PERM_FEATURE_LABELS[group.feature] ?? group.feature}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.keys.map((key) => (
                        <PermCheckbox
                          key={key}
                          perm={key}
                          label={permActionLabel(key)}
                          checked={perms[key]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t border-gray-100 pt-3">
                <p className="text-sm font-medium text-gray-700">
                  Modules sensibles
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {PERM_MODULE_KEYS.map((key) => (
                    <PermCheckbox
                      key={key}
                      perm={key}
                      label={PERM_MODULE_LABELS[key] ?? key}
                      checked={perms[key]}
                    />
                  ))}
                </div>
              </div>

              <SubmitButton className="btn-primary">
                Enregistrer {ROLE_LABELS[role]}
              </SubmitButton>
            </form>
          </section>
        );
      })}
    </div>
  );
}
