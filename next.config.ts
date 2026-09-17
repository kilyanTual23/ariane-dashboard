import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La racine du projet, sinon Turbopack remonte jusqu'au package-lock.json du profil utilisateur.
  turbopack: { root: __dirname },
  // better-sqlite3 et libsql sont des modules natifs : ils ne doivent jamais être bundlés.
  serverExternalPackages: ["better-sqlite3", "@libsql/client", "libsql"],
};

export default nextConfig;
