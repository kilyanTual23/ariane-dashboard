import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
};

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    from?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, from } = await searchParams;

  let initialError: string | undefined;
  if (error === "not_configured") {
    initialError =
      "La variable ARIANE_PASSWORD n'est pas encore configurée dans le fichier .env.local de votre serveur.";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 text-xs font-medium tracking-tight text-fg-muted">
            <span className="size-1.5 rounded-full bg-fg" />
            Ariane
          </span>
          <h1 className="mt-4 text-2xl font-light tracking-tight text-fg sm:text-3xl">
            Accès sécurisé
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            Ce carnet généalogique est privé. Veuillez saisir le mot de passe pour continuer.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8">
          <LoginForm initialError={initialError} from={from} />
        </div>

        <p className="mt-8 text-center text-[11px] text-fg-subtle">
          Ariane · Carnet généalogique personnel
        </p>
      </div>
    </main>
  );
}
