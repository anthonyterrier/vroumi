import Link from "next/link";
import {
  requireUser,
  isAdminUser,
  isImpersonating,
  getPreviewRole,
} from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/actions";
import { stopLens } from "@/app/(app)/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { ROLE_LABELS } from "@/lib/labels";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const admin = await isAdminUser(user.id);
  const [impersonating, previewRole] = await Promise.all([
    isImpersonating(),
    getPreviewRole(),
  ]);
  const lensLabel = impersonating
    ? `Vous consultez en tant que ${user.name}`
    : previewRole
      ? `Aperçu du rôle « ${ROLE_LABELS[previewRole]} »`
      : null;

  return (
    <div className="min-h-screen">
      {lensLabel && (
        <div className="no-print sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm text-white">
          <span className="font-medium">
            {lensLabel} · lecture seule
          </span>
          <form action={stopLens}>
            <SubmitButton
              className="rounded bg-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/30"
              pendingLabel="…"
            >
              Quitter
            </SubmitButton>
          </form>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-bold text-gray-900">Vroumi</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {admin && (
              <Link
                href="/admin"
                className="font-medium text-brand-600 hover:underline"
              >
                Admin
              </Link>
            )}
            <span className="hidden text-gray-500 sm:inline">{user.name}</span>
            <form action={logoutAction}>
              <button className="text-gray-500 hover:text-gray-900">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5 pb-16">{children}</main>
      <footer className="no-print pb-6 text-center text-[11px] text-gray-300">
        Vroumi · v{process.env.NEXT_PUBLIC_APP_VERSION}
      </footer>
    </div>
  );
}
