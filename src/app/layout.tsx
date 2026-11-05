import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/Toast";
import { APPEARANCE_SCRIPT } from "@/lib/appearance-script";

/**
 * Inter pour toute l'interface : très lisible en petit corps, chiffres
 * tabulaires natifs pour les années et les compteurs. Geist Mono ne sert
 * qu'aux raccourcis clavier et aux cotes d'archives.
 */
const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · Ariane",
    default: "Ariane · Recherches généalogiques",
  },
  description: "Recensement des trouvailles généalogiques, profil par profil.",
  applicationName: "Ariane",
  // Ajoutée à l'écran d'accueil, Ariane s'ouvre en plein écran.
  appleWebApp: { capable: true, title: "Ariane", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Jusqu'aux bords de l'écran ; les barres respectent les zones sûres (encoche, barre d'accueil).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-fg">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
