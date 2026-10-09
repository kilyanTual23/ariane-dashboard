"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE, hashToken } from "@/lib/auth";

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = (formData.get("password") as string | null)?.trim() ?? "";
  const expectedPassword = process.env.ARIANE_PASSWORD;

  if (!expectedPassword) {
    return {
      error: "ARIANE_PASSWORD n'est pas encore défini dans le fichier .env.local du serveur.",
    };
  }

  if (!password || password !== expectedPassword) {
    return { error: "Mot de passe incorrect." };
  }

  const token = await hashToken(expectedPassword);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });

  const rawFrom = (formData.get("from") as string | null) ?? "";
  const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/";
  redirect(from);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}

