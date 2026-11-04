"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { resolvedTheme, setTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <div className="size-8 rounded-lg border border-transparent" aria-hidden="true" />
    );
  }

  const isLight = resolvedTheme === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-fg-muted shadow-soft transition-colors hover:border-border-strong hover:text-fg"
      title={isLight ? "Basculer en mode sombre (🌙)" : "Basculer en mode clair (☀️)"}
      aria-label="Changer le thème d'affichage"
    >
      <span className="text-[13px]">{isLight ? "🌙" : "☀️"}</span>
    </button>
  );
}

