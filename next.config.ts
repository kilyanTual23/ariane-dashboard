import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La racine du projet, sinon Turbopack remonte jusqu'au package-lock.json du profil utilisateur.
  turbopack: { root: __dirname },
  // better-sqlite3 est un module natif : il ne doit jamais être bundlé.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
