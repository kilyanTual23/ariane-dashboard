import type { Metadata } from "next";

import { Logo } from "@/components/icons";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, from } = await searchParams;

  const initialError =
    error === "not_configured"
      ? "La variable ARIANE_PASSWORD n’est pas configurée dans le fichier .env.local du serveur."
      : undefined;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[22rem]">
        <div className="flex flex-col items-center text-center">
          <Logo size={40} className="text-accent" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Bienvenue sur Ariane</h1>
          <p className="mt-1.5 text-ui text-fg-muted">Carnet de recherches généalogiques privé.</p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <LoginForm initialError={initialError} from={typeof from === "string" ? from : undefined} />
        </div>
      </div>
    </main>
  );
}
