import Link from "next/link";

import { IconArrowLeft, Logo } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={36} className="text-accent" />
      <p className="num mt-6 text-sm font-medium text-fg-subtle">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Le fil s’arrête ici</h1>
      <p className="mt-2 max-w-sm text-ui text-fg-muted">
        Cette page, cette fiche ou ce profil n’existe pas, ou plus.
      </p>
      <Link href="/" className={buttonClass("primary", "mt-6")}>
        <IconArrowLeft size={14} />
        Retour aux profils
      </Link>
    </main>
  );
}
