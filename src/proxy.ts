import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Contrôle rapide : sans cookie de session, on renvoie vers la connexion.
 * La vraie vérification (session valide, profil appartenant au compte) se fait
 * côté données, dans src/lib/access.ts.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/login") return NextResponse.next();

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const from = pathname + search;
  if (from !== "/") loginUrl.searchParams.set("from", from);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Intercepter toutes les requêtes sauf les fichiers statiques de Next.js, images et assets
     */
    "/((?!_next/static|_next/image|favicon.ico|fra.traineddata|manifest.webmanifest|icons/|apple-icon).*)",
  ],
};
