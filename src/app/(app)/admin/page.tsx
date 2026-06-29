import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { CopyButton } from "@/components/CopyButton";
import { RoleSelect } from "@/components/RoleSelect";
import {
  createAccount,
  inviteUser,
  deleteInvite,
  toggleAdmin,
  deleteUser,
  createGarage,
  updateGarage,
  deleteGarage,
  addMember,
  removeMember,
  updateMemberRole,
  startImpersonation,
  startPreview,
} from "@/app/(app)/admin/actions";
import { ROLE_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/format";

function GarageOptions({
  garages,
}: {
  garages: { id: string; name: string }[];
}) {
  return (
    <>
      {garages.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </>
  );
}

function RoleOptions() {
  return (
    <>
      {Object.entries(ROLE_LABELS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [users, garages, invites, h] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { memberships: { include: { garage: true } } },
    }),
    prisma.garage.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        memberships: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.invite.findMany({
      where: { acceptedAt: null },
      orderBy: { createdAt: "desc" },
      include: { garage: true },
    }),
    headers(),
  ]);

  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const baseUrl = `${proto}://${host}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Administration</h1>
        <Link
          href="/admin/roles"
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Droits par rôle →
        </Link>
      </div>

      {/* Aperçu de rôle */}
      <section className="card space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Prévisualiser un rôle
        </h2>
        <p className="text-xs text-gray-400">
          Affiche l&apos;application en lecture seule comme la verrait le rôle
          choisi. Un bandeau permet de revenir au mode administrateur.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["OWNER", "DRIVER", "VIEWER"] as const).map((r) => (
            <form key={r} action={startPreview.bind(null, r)}>
              <SubmitButton className="btn-secondary text-xs" pendingLabel="…">
                Voir comme {ROLE_LABELS[r]}
              </SubmitButton>
            </form>
          ))}
        </div>
      </section>

      {/* Invitations */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invitations en attente</h2>
          <Modal trigger="+ Inviter" title="Inviter une personne">
            <form action={inviteUser} className="space-y-3">
              <div>
                <label className="label">Nom</label>
                <input name="name" className="input" required />
              </div>
              <div>
                <label className="label">
                  E-mail{" "}
                  <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <input name="email" type="email" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Garage</label>
                  <select name="garageId" className="input" required>
                    <GarageOptions garages={garages} />
                  </select>
                </div>
                <div>
                  <label className="label">Rôle</label>
                  <select name="role" className="input" defaultValue="DRIVER">
                    <RoleOptions />
                  </select>
                </div>
              </div>
              <SubmitButton className="btn-primary w-full">
                Créer l&apos;invitation
              </SubmitButton>
            </form>
          </Modal>
        </div>

        <div className="space-y-2">
          {invites.length === 0 && (
            <p className="card text-center text-sm text-gray-400">
              Aucune invitation en attente.
            </p>
          )}
          {invites.map((inv) => {
            const link = `${baseUrl}/invite/${inv.token}`;
            return (
              <div key={inv.id} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {inv.name}{" "}
                      <span className="text-sm font-normal text-gray-400">
                        {inv.email ?? "sans e-mail"}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {inv.garage.name} · {ROLE_LABELS[inv.role]}
                      {inv.userId ? " · activation de compte" : ""} · expire le{" "}
                      {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <form action={deleteInvite.bind(null, inv.id)}>
                    <DeleteButton confirmMessage="Annuler cette invitation ?" />
                  </form>
                </div>
                <div className="flex items-center gap-2">
                  <input readOnly value={link} className="input text-xs" />
                  <CopyButton value={link} className="btn-secondary shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Garages */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Garages</h2>
          <Modal trigger="+ Garage" title="Créer un garage">
            <form action={createGarage} className="space-y-3">
              <div>
                <label className="label">Nom du garage</label>
                <input name="name" className="input" required autoFocus />
              </div>
              <div>
                <label className="label">
                  Adresse{" "}
                  <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <input name="address" className="input" />
              </div>
              <div>
                <label className="label">
                  Téléphone{" "}
                  <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <input name="phone" className="input" />
              </div>
              <SubmitButton className="btn-primary w-full">Créer</SubmitButton>
            </form>
          </Modal>
        </div>

        <div className="space-y-3">
          {garages.map((g) => {
            const memberIds = new Set(g.memberships.map((m) => m.userId));
            const nonMembers = users.filter((u) => !memberIds.has(u.id));
            return (
              <div key={g.id} className="card space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{g.name}</p>
                    <p className="text-xs text-gray-400">
                      {g.address ?? ""}
                      {g.address && g.phone ? " · " : ""}
                      {g.phone ?? ""}
                      {!g.address && !g.phone
                        ? `créé le ${formatDate(g.createdAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Modal
                      trigger="Modifier"
                      title="Modifier le garage"
                      triggerClassName="text-xs text-brand-600 hover:underline"
                    >
                      <form
                        action={updateGarage.bind(null, g.id)}
                        className="space-y-3"
                      >
                        <div>
                          <label className="label">Nom</label>
                          <input
                            name="name"
                            className="input"
                            defaultValue={g.name}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Adresse</label>
                          <input
                            name="address"
                            className="input"
                            defaultValue={g.address ?? ""}
                          />
                        </div>
                        <div>
                          <label className="label">Téléphone</label>
                          <input
                            name="phone"
                            className="input"
                            defaultValue={g.phone ?? ""}
                          />
                        </div>
                        <SubmitButton className="btn-primary w-full">
                          Enregistrer
                        </SubmitButton>
                      </form>
                    </Modal>
                    <form action={deleteGarage.bind(null, g.id)}>
                      <DeleteButton
                        confirmMessage={`Supprimer le garage ${g.name} ? Ses véhicules et données seront supprimés.`}
                      />
                    </form>
                  </div>
                </div>

                {/* Membres */}
                <div className="space-y-1.5">
                  {g.memberships.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
                    >
                      <span className="truncate text-sm">
                        {m.user.name}
                        <span className="ml-1 text-xs text-gray-400">
                          {m.user.email ?? ""}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <RoleSelect
                          action={updateMemberRole.bind(null, m.id)}
                          defaultValue={m.role}
                        />
                        <form action={removeMember.bind(null, m.id)}>
                          <DeleteButton
                            label="✕"
                            confirmMessage={`Retirer ${m.user.name} du garage ${g.name} ?`}
                            className="text-gray-400 hover:text-red-600"
                          />
                        </form>
                      </div>
                    </div>
                  ))}
                  {g.memberships.length === 0 && (
                    <p className="text-xs text-gray-400">Aucun membre.</p>
                  )}
                </div>

                {/* Ajouter un membre */}
                {nonMembers.length > 0 && (
                  <form
                    action={addMember}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="garageId" value={g.id} />
                    <div className="grow">
                      <label className="label">Ajouter un membre</label>
                      <select name="userId" className="input" required>
                        {nonMembers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                            {u.email ? ` (${u.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select name="role" className="input w-auto" defaultValue="DRIVER">
                      <RoleOptions />
                    </select>
                    <SubmitButton className="btn-secondary" pendingLabel="…">
                      Ajouter
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Comptes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Comptes</h2>
          <Modal trigger="+ Compte" title="Créer un compte">
            <form action={createAccount} className="space-y-3">
              <div>
                <label className="label">Nom complet / surnom</label>
                <input name="name" className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prénom</label>
                  <input name="firstName" className="input" />
                </div>
                <div>
                  <label className="label">Nom</label>
                  <input name="lastName" className="input" />
                </div>
              </div>
              <div>
                <label className="label">
                  E-mail{" "}
                  <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <input name="email" type="email" className="input" />
              </div>
              <div>
                <label className="label">
                  Téléphone{" "}
                  <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <input name="phone" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Garage</label>
                  <select name="garageId" className="input" defaultValue="">
                    <option value="">— Aucun —</option>
                    <GarageOptions garages={garages} />
                  </select>
                </div>
                <div>
                  <label className="label">Rôle</label>
                  <select name="role" className="input" defaultValue="DRIVER">
                    <RoleOptions />
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Le compte est créé sans accès. Créez ensuite un lien
                d&apos;activation pour qu&apos;il choisisse son mot de passe.
              </p>
              <SubmitButton className="btn-primary w-full">
                Créer le compte
              </SubmitButton>
            </form>
          </Modal>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {u.name}{" "}
                    {u.isAdmin && (
                      <span className="badge border-brand-200 bg-brand-100 text-brand-800">
                        Admin
                      </span>
                    )}
                    {!u.activated && (
                      <span className="badge border-amber-200 bg-amber-100 text-amber-800">
                        Sans accès
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {u.email ?? "sans e-mail"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {admin.id !== u.id && (
                    <form action={startImpersonation.bind(null, u.id)}>
                      <SubmitButton
                        className="text-xs text-brand-600 hover:underline"
                        pendingLabel="…"
                      >
                        Voir en tant que
                      </SubmitButton>
                    </form>
                  )}
                  {admin.id !== u.id && (
                    <form action={toggleAdmin.bind(null, u.id, !u.isAdmin)}>
                      <SubmitButton
                        className="text-xs text-brand-600 hover:underline"
                        pendingLabel="…"
                      >
                        {u.isAdmin ? "Retirer admin" : "Promouvoir admin"}
                      </SubmitButton>
                    </form>
                  )}
                  {admin.id !== u.id && (
                    <form action={deleteUser.bind(null, u.id)}>
                      <DeleteButton
                        label="Supprimer"
                        confirmMessage={`Supprimer définitivement le compte de ${u.name} ? Cette action est irréversible.`}
                      />
                    </form>
                  )}
                  {admin.id === u.id && (
                    <span className="text-xs text-gray-400">vous</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {u.memberships.map((m) => (
                  <span
                    key={m.id}
                    className="badge border-gray-200 bg-gray-100 text-gray-600"
                  >
                    {m.garage.name} · {ROLE_LABELS[m.role]}
                  </span>
                ))}

                {/* Lien d'activation pour un compte sans accès */}
                {!u.activated && garages.length > 0 && (
                  <Modal
                    trigger="Créer un lien d'accès"
                    title={`Activer le compte de ${u.name}`}
                    triggerClassName="text-xs text-brand-600 hover:underline"
                  >
                    <form action={inviteUser} className="space-y-3">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="name" value={u.name} />
                      {u.email && (
                        <input type="hidden" name="email" value={u.email} />
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Garage</label>
                          <select name="garageId" className="input" required>
                            <GarageOptions garages={garages} />
                          </select>
                        </div>
                        <div>
                          <label className="label">Rôle</label>
                          <select
                            name="role"
                            className="input"
                            defaultValue={u.memberships[0]?.role ?? "DRIVER"}
                          >
                            <RoleOptions />
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">
                        Le lien généré apparaîtra dans « Invitations en attente ».
                      </p>
                      <SubmitButton className="btn-primary w-full">
                        Générer le lien
                      </SubmitButton>
                    </form>
                  </Modal>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
