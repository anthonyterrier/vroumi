import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuthForm } from "@/components/AuthForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // L'inscription libre ne sert qu'à créer le tout premier compte (admin).
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return (
      <>
        <h2 className="mb-3 text-lg font-semibold">Inscriptions fermées</h2>
        <p className="text-sm text-gray-600">
          La création de compte se fait uniquement sur invitation. Demandez un
          lien d&apos;invitation à l&apos;administrateur, puis ouvrez-le pour
          choisir votre mot de passe.
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
      <h2 className="mb-1 text-lg font-semibold">Créer le compte administrateur</h2>
      <p className="mb-4 text-sm text-gray-500">
        Ce premier compte gère l&apos;application et les invitations.
      </p>
      <AuthForm mode="register" />
    </>
  );
}
