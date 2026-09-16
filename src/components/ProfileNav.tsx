"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

export function ProfileNav({
  items,
  variant = "primary",
  className = "",
}: {
  items: Item[];
  variant?: "primary" | "muted";
  className?: string;
}) {
  const pathname = usePathname();
  const muted = variant === "muted";

  return (
    <nav className={`flex gap-1 overflow-x-auto md:flex-col md:overflow-visible ${className}`}>
      {items.map((item) => {
        const active =
          item.href === pathname ||
          (pathname.startsWith(`${item.href}/`) && item.href.split("/").length > 3);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center justify-between gap-2 rounded-[10px] px-3 py-1.5 transition-all duration-150 md:shrink ${
              muted ? "text-[13px]" : "text-sm"
            } ${
              active
                ? "bg-surface font-medium text-fg shadow-soft"
                : `${muted ? "text-fg-subtle" : "text-fg-muted"} hover:bg-surface/70 hover:text-fg`
            }`}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums text-fg-muted">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function ProfileSwitcher({
  profiles,
  current,
}: {
  profiles: { slug: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <select
      className="field bg-transparent text-sm font-medium hover:bg-surface-2"
      value={current}
      onChange={(e) => {
        if (e.target.value === "__new__") router.push("/");
        else router.push(`/p/${e.target.value}`);
      }}
      aria-label="Changer de profil"
    >
      {profiles.map((p) => (
        <option key={p.slug} value={p.slug}>
          {p.name}
        </option>
      ))}
      <option value="__new__">＋ Tous les profils…</option>
    </select>
  );
}
