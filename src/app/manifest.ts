import type { MetadataRoute } from "next";

/** Ariane s'installe sur l'écran d'accueil et s'ouvre en plein écran, comme une application. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ariane · Recherches généalogiques",
    short_name: "Ariane",
    description: "Carnet de recherches généalogiques.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f2f3",
    theme_color: "#f2f2f3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
