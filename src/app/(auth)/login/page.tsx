import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Connexion</h2>
      <AuthForm mode="login" />
    </>
  );
}
