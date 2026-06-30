import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForms } from "@/components/ProfileForms";

export default async function ProfilePage() {
  const current = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: {
      name: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  });
  if (!user) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mon profil</h1>
        <p className="text-sm text-gray-500">
          Gérez vos informations et votre mot de passe.
        </p>
      </div>
      <ProfileForms user={user} />
    </div>
  );
}
