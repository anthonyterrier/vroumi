import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { InviteForm } from "@/components/InviteForm";
import { ROLE_LABELS } from "@/lib/labels";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { garage: true },
  });

  const invalid =
    !invite || invite.acceptedAt != null || invite.expiresAt < new Date();

  if (invalid) {
    return (
      <>
        <h2 className="mb-3 text-lg font-semibold">Invitation invalide</h2>
        <p className="text-sm text-gray-600">
          Ce lien d&apos;invitation est introuvable, déjà utilisé ou expiré.
          Demandez-en un nouveau à l&apos;administrateur.
        </p>
        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Aller à la connexion
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Bienvenue {invite.name} 👋</h2>
      <p className="mb-4 text-sm text-gray-500">
        Vous êtes invité·e à rejoindre le garage{" "}
        <strong>{invite.garage.name}</strong> en tant que{" "}
        <strong>{ROLE_LABELS[invite.role]}</strong>. Choisissez un mot de passe
        pour activer votre compte ({invite.email}).
      </p>
      <InviteForm token={token} />
    </>
  );
}
