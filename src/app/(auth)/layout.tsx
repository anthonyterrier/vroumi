export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="Carnet Auto" className="h-14 w-14 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Carnet Auto</h1>
        <p className="text-sm text-gray-500">Le carnet d'entretien de vos véhicules</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
