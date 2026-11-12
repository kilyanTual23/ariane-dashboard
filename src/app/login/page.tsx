import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/icons";
import { countAccounts, getCurrentAccount } from "@/lib/auth";
import { BootstrapForm, LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { from } = await searchParams;
  if (await getCurrentAccount()) redirect("/");

  // Premier lancement : on crée le compte du propriétaire avant tout.
  const firstRun = (await countAccounts()) === 0;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[22rem]">
        <div className="flex flex-col items-center text-center">
          <Logo size={40} className="text-accent" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight">
            {firstRun ? "Créer votre compte" : "Bienvenue sur Ariane"}
          </h1>
          <p className="mt-1.5 text-ui text-fg-muted">
            {firstRun
              ? "Ariane passe aux comptes personnels. Le vôtre récupère tous les profils existants."
              : "Carnet de recherches généalogiques privé."}
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-card">
          {firstRun ? (
            <BootstrapForm />
          ) : (
            <LoginForm from={typeof from === "string" ? from : undefined} />
          )}
        </div>
      </div>
    </main>
  );
}
