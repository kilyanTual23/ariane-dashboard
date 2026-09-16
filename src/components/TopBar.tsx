"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Tab = { href: string; label: string; badge?: number };

/**
 * Une barre fine en haut, et c'est tout : la navigation ne mange plus une
 * colonne entière de l'écran, la page commence tout de suite.
 */
export function TopBar({
  profiles,
  current,
  tabs,
  secondary,
}: {
  profiles: { slug: string; name: string }[];
  current: string;
  tabs: Tab[];
  secondary: Tab[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === pathname || (pathname.startsWith(`${href}/`) && href.split("/").length > 3);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1750px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-8">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 text-[13px] font-medium tracking-tight transition-opacity hover:opacity-60"
        >
          <span className="size-1.5 rounded-full bg-fg" />
          Ariane
        </Link>

        <select
          className="w-auto max-w-44 shrink-0 cursor-pointer rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] text-fg-muted transition-colors hover:border-border hover:bg-surface-2"
          value={current}
          onChange={(e) => {
            if (e.target.value === "__all__") router.push("/");
            else router.push(`/p/${e.target.value}`);
          }}
          aria-label="Changer de profil"
        >
          {profiles.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
          <option value="__all__">Tous les profils…</option>
        </select>

        <nav className="-mx-1 flex flex-1 items-center gap-0.5 overflow-x-auto px-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                isActive(tab.href)
                  ? "bg-surface font-medium text-fg shadow-soft"
                  : "text-fg-muted hover:bg-surface/70 hover:text-fg"
              }`}
            >
              {tab.label}
              {tab.badge ? (
                <span className="num rounded-full bg-surface-3 px-1.5 text-[11px] text-fg-muted">
                  {tab.badge}
                </span>
              ) : null}
            </Link>
          ))}

          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {secondary.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  isActive(tab.href)
                    ? "bg-surface font-medium text-fg shadow-soft"
                    : "text-fg-subtle hover:bg-surface/70 hover:text-fg"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </span>
        </nav>
      </div>
    </header>
  );
}
