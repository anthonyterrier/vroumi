import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Version dérivée du dernier commit Git (mise à jour à chaque déploiement).
// Format : "<hash court> · <date>". Repli sur la date de build si Git absent.
function appVersion(): string {
  try {
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    const iso = execSync("git log -1 --format=%cI").toString().trim();
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
    return `${hash} · ${date}`;
  } catch {
    return new Date().toLocaleDateString("fr-FR");
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion(),
  },
  experimental: {
    // Les Server Actions sont limitées à 1 Mo par défaut : on relève la limite
    // pour permettre l'envoi d'une photo / PDF de carte grise (plafonné à 8 Mo
    // côté code, voir registration-actions.ts).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
