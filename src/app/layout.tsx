import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * DM Sans pour toute l'interface : une géométrique contemporaine, lisible en
 * petit corps et avec assez de caractère pour ne pas retomber sur la sans-serif
 * système. JetBrains Mono ne sert qu'aux chiffres alignés (années, compteurs).
 */
const sans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · Ariane",
    default: "Ariane · Recherches généalogiques",
  },
  description: "Recensement des trouvailles généalogiques, profil par profil.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-fg">{children}</body>
    </html>
  );
}
