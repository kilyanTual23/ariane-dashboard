import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Autoriser la page de connexion
  if (pathname === "/login") {
    const expectedPassword = process.env.ARIANE_PASSWORD;
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (expectedPassword && token && (await verifyToken(token, expectedPassword))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const expectedPassword = process.env.ARIANE_PASSWORD;

  // Si aucun mot de passe n'est configuré dans .env, bloquer par sécurité
  if (!expectedPassword) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "ARIANE_PASSWORD non configuré sur le serveur" }, { status: 503 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "not_configured");
    return NextResponse.redirect(loginUrl);
  }

  // Vérification de la session
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuth = token ? await verifyToken(token, expectedPassword) : false;

  if (isAuth) {
    return NextResponse.next();
  }

  // Non authentifié : API renvoie 401, pages renvoient vers /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const from = pathname + search;
  if (from !== "/") {
    loginUrl.searchParams.set("from", from);
  }
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

