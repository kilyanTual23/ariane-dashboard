"use client";

import { useTheme, type Theme, type ZoomLevel } from "@/lib/theme";

export function ThemeSelector() {
  const { theme, resolvedTheme, setTheme, zoom, setZoom, mounted } = useTheme();

  const themeOptions: {
    key: Theme;
    title: string;
    badge: string;
    desc: string;
    icon: string;
  }[] = [
    {
      key: "light",
      title: "Mode clair",
      badge: "Recommandé de jour",
      desc: "Fond papier doux, encre haute lisibilité et teintes d'archives étudiées pour ne pas fatiguer les yeux.",
      icon: "☀️",
    },
    {
      key: "dark",
      title: "Mode sombre",
      badge: "Nocturne",
      desc: "Interface feutrée et contrastes doux, pensée pour les recherches nocturnes prolongées.",
      icon: "🌙",
    },
    {
      key: "system",
      title: "Automatique",
      badge: "Système",
      desc: "S'adapte dynamiquement aux préférences d'apparence de votre ordinateur ou appareil.",
      icon: "💻",
    },
  ];

  const zoomOptions: {
    key: ZoomLevel;
    label: string;
    sublabel: string;
    badge?: string;
  }[] = [
    {
      key: "1",
      label: "100%",
      sublabel: "Compact",
    },
    {
      key: "1.1",
      label: "110%",
      sublabel: "Confortable",
      badge: "Recommandé",
    },
    {
      key: "1.2",
      label: "120%",
      sublabel: "Grand",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Sélection du thème de couleur */}
      <div>
        <span className="block text-xs font-semibold text-fg mb-2">Thème de couleur</span>
        <div className="grid gap-3 sm:grid-cols-3">
          {themeOptions.map((opt) => {
            const isSelected = mounted ? theme === opt.key : opt.key === "system";

            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTheme(opt.key)}
                className={`group relative flex flex-col text-left rounded-2xl border p-4 transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-accent bg-surface shadow-card ring-2 ring-accent/25"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2/60 shadow-soft"
                }`}
              >
                {/* Entête avec icône et sélection */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">
                      {opt.icon}
                    </span>
                    <span className="text-[13px] font-semibold text-fg tracking-tight">
                      {opt.title}
                    </span>
                  </div>

                  <div
                    className={`flex size-4.5 items-center justify-center rounded-full border transition-colors ${
                      isSelected
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-surface group-hover:border-fg/40"
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="size-2.5"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 8 7 12 13 4" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Aperçu visuel miniature de l'interface */}
                <div className="mb-3 overflow-hidden rounded-xl border border-border">
                  {opt.key === "light" && (
                    <div className="bg-[#f8fafc] p-2.5 text-[10px] space-y-1.5">
                      <div className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="h-2 w-14 rounded-full bg-slate-900" />
                          <span className="inline-block rounded bg-teal-50 px-1 py-0.2 text-[8px] font-semibold text-teal-700 border border-teal-200/60">
                            100%
                          </span>
                        </div>
                        <div className="h-1.5 w-20 rounded-full bg-slate-400/80" />
                        <div className="h-1.5 w-12 rounded-full bg-slate-300" />
                      </div>
                    </div>
                  )}

                  {opt.key === "dark" && (
                    <div className="bg-[#0c0d10] p-2.5 text-[10px] space-y-1.5">
                      <div className="rounded-lg border border-white/10 bg-[#141519] p-2 shadow-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="h-2 w-14 rounded-full bg-zinc-100" />
                          <span className="inline-block rounded bg-teal-950 px-1 py-0.2 text-[8px] font-semibold text-teal-300 border border-teal-800/60">
                            100%
                          </span>
                        </div>
                        <div className="h-1.5 w-20 rounded-full bg-zinc-500" />
                        <div className="h-1.5 w-12 rounded-full bg-zinc-700" />
                      </div>
                    </div>
                  )}

                  {opt.key === "system" && (
                    <div className="grid grid-cols-2 text-[10px]">
                      {/* Moitié clair */}
                      <div className="bg-[#f8fafc] p-2.5 border-r border-border space-y-1.5">
                        <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs space-y-1">
                          <div className="h-2 w-7 rounded-full bg-slate-900" />
                          <div className="h-1.5 w-9 rounded-full bg-slate-400" />
                        </div>
                      </div>
                      {/* Moitié sombre */}
                      <div className="bg-[#0c0d10] p-2.5 space-y-1.5">
                        <div className="rounded-lg border border-white/10 bg-[#141519] p-1.5 shadow-xs space-y-1">
                          <div className="h-2 w-7 rounded-full bg-zinc-100" />
                          <div className="h-1.5 w-9 rounded-full bg-zinc-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-fg-muted leading-relaxed flex-1">
                  {opt.desc}
                </p>

                {/* État courant si système */}
                {opt.key === "system" && mounted && (
                  <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[11px] text-fg-subtle">
                    <span>Actuellement actif :</span>
                    <span className="font-medium text-fg">
                      {resolvedTheme === "light" ? "Mode clair ☀️" : "Mode sombre 🌙"}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Taille d'affichage & Lisibilité */}
      <div className="pt-4 border-t border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
          <div>
            <span className="text-xs font-semibold text-fg">Taille d’affichage & Lisibilité</span>
            <p className="text-[11px] text-fg-subtle">
              Échelle native du texte et de l’interface. Le niveau 110% est activé par défaut pour un confort visuel optimal.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {zoomOptions.map((z) => {
            const isSelected = mounted ? zoom === z.key : z.key === "1.1";

            return (
              <button
                key={z.key}
                type="button"
                onClick={() => setZoom(z.key)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-3 transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "border-accent bg-surface shadow-soft ring-2 ring-accent/25"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-fg tracking-tight">{z.label}</span>
                  {z.badge && (
                    <span className="rounded-full bg-teal-500/10 px-1.5 py-px text-[9.5px] font-semibold text-teal-600">
                      {z.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-fg-muted">{z.sublabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
