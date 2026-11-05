import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La racine du projet, sinon Turbopack remonte jusqu'au package-lock.json du profil utilisateur.
  turbopack: { root: __dirname },
  // En bas à gauche, l'indicateur de dev masquerait le sélecteur de thème de la barre latérale.
  devIndicators: { position: "bottom-right" },
  // Modules natifs C++/Rust : ils ne doivent jamais être bundlés par Turbopack.
  serverExternalPackages: ["better-sqlite3", "@libsql/client", "libsql", "@napi-rs/canvas", "sharp"],
  // Autoriser l'accès en développement et Server Actions depuis Tailscale
  allowedDevOrigins: [
    "100.114.238.81",
    "100.114.238.81:3000",
    "*.ts.net",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "100.114.238.81:3000",
        "100.114.238.81",
        "*.ts.net",
        "localhost:3000",
        "127.0.0.1:3000",
      ],
    },
  },
};

export default nextConfig;
