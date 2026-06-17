import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { CopyButton } from "@/components/CopyButton";
import {
  createInvite,
  deleteInvite,
  toggleAdmin,
  createGarage,
  removeMember,
  deleteUser,
} from "@/app/(app)/admin/actions";
import { ROLE_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/format";

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [users, garages, invites, h] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { memberships: { include: { garage: true } } },
    }),
    prisma.garage.findMany({ orderBy: { createdAt: "asc" } }),
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
      <h1 className="text-2xl font-bold">Administration</h1>

      {/* Invitations */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invitations en attente</h2>
          <Modal trigger="+ Inviter" title="Inviter une personne">
            <form action={createInvite} className="space-y-3">
              <div>
                <label className="label">Nom</label>
                <input name="name" className="input" required />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input name="email" type="email" className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Garage</label>
                  <select name="garageId" className="input" required>
                    {garages.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Rôle</label>
                  <select name="role" className="input" defaultValue="DRIVER">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
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
                        {inv.email}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {inv.garage.name} · {ROLE_LABELS[inv.role]} · expire le{" "}
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
              <SubmitButton className="btn-primary w-full">Créer</SubmitButton>
            </form>
          </Modal>
        </div>
        <div className="space-y-2">
          {garages.map((g) => (
            <div key={g.id} className="card flex items-center justify-between py-3">
              <span className="font-medium">{g.name}</span>
              <span className="text-xs text-gray-400">
                créé le {formatDate(g.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Comptes */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Comptes</h2>
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
                  </p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
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
                        confirmMessage={`Supprimer définitivement le compte de ${u.name} (${u.email}) ? Cette action est irréversible.`}
                      />
                    </form>
                  )}
                  {admin.id === u.id && (
                    <span className="text-xs text-gray-400">vous</span>
                  )}
                </div>
              </div>
              {u.memberships.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {u.memberships.map((m) => (
                    <span
                      key={m.id}
                      className="badge border-gray-200 bg-gray-100 text-gray-600"
                    >
                      {m.garage.name} · {ROLE_LABELS[m.role]}
                      <form
                        action={removeMember.bind(null, m.id)}
                        className="ml-1 inline"
                      >
                        <DeleteButton
                          label="✕"
                          confirmMessage={`Retirer ${u.name} du garage ${m.garage.name} ?`}
                          className="text-gray-400 hover:text-red-600"
                        />
                      </form>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
