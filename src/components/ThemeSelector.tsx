"use client";

import type { ReactNode } from "react";

import { IconCheck, IconMonitor, IconMoon, IconSun } from "@/components/icons";
import { ACCENTS, SCALES, useTheme, type Accent, type Scale, type Theme } from "@/lib/theme";

const THEMES: { key: Theme; title: string; icon: ReactNode }[] = [
  { key: "light", title: "Clair", icon: <IconSun size={14} /> },
  { key: "dark", title: "Sombre", icon: <IconMoon size={14} /> },
  { key: "system", title: "Système", icon: <IconMonitor size={14} /> },
];

/** Pastilles du sélecteur : la teinte claire et la teinte sombre de chaque accent. */
const ACCENT_SWATCH: Record<Accent, { label: string; light: string; dark: string }> = {
  violet: { label: "Violet", light: "#6e56cf", dark: "#7c66dc" },
  indigo: { label: "Indigo", light: "#3e63dd", dark: "#4a6ee6" },
  rose: { label: "Rose", light: "#cf3a8f", dark: "#d84a9c" },
  cuivre: { label: "Cuivre", light: "#b5542b", dark: "#c96a3f" },
  graphite: { label: "Graphite", light: "#17171a", dark: "#ededef" },
};

const SCALE_LABEL: Record<Scale, string> = {
  "0.9": "Compact",
  "1": "Standard",
  "1.1": "Confortable",
  "1.2": "Grand",
};

/** Aperçu miniature d'une interface dans un thème donné. */
function Preview({ dark }: { dark: boolean }) {
  const c = dark
    ? { bg: "#0d0d0f", panel: "#17171a", line: "#2a2a2f", ink: "#ededef", soft: "#4a4a52" }
    : { bg: "#f2f2f3", panel: "#ffffff", line: "#e6e6e9", ink: "#17171a", soft: "#c4c4cc" };
  return (
    <div className="flex h-full gap-1.5 p-2" style={{ background: c.bg }}>
      <div className="flex w-1/4 flex-col gap-1 pt-1">
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: c.ink }} />
        <div className="h-1 w-full rounded-full" style={{ background: c.soft }} />
        <div className="h-1 w-2/3 rounded-full" style={{ background: c.soft }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 rounded-md p-1.5" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: c.ink }} />
        <div className="flex gap-1">
          {["#30a46c", "#3e63dd", "#e5484d"].map((dot) => (
            <div key={dot} className="h-4 flex-1 rounded" style={{ border: `1px solid ${c.line}` }}>
              <div className="m-1 size-1 rounded-full" style={{ background: dot }} />
            </div>
          ))}
        </div>
        <div className="h-1 w-3/4 rounded-full" style={{ background: c.soft }} />
      </div>
    </div>
  );
}

export function ThemeSelector() {
  const { theme, setTheme, scale, setScale, accent, setAccent, resolvedTheme, mounted } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label">Thème</p>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Thème">
          {THEMES.map((opt) => {
            const selected = mounted && theme === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(opt.key)}
                className="group flex flex-col gap-2 text-left"
              >
                <span
                  className={`block h-20 overflow-hidden rounded-lg border transition-[border-color,box-shadow] ${
                    selected ? "border-accent ring-2 ring-ring" : "border-border group-hover:border-border-strong"
                  }`}
                >
                  {opt.key === "system" ? (
                    <span className="grid h-full grid-cols-2">
                      <Preview dark={false} />
                      <Preview dark />
                    </span>
                  ) : (
                    <Preview dark={opt.key === "dark"} />
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-ui">
                  <span className="text-fg-subtle">{opt.icon}</span>
                  {opt.title}
                  {selected && <IconCheck size={13} className="ml-auto" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="label">Couleur d’accent</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur d’accent">
          {ACCENTS.map((a) => {
            const selected = mounted && accent === a;
            const swatch = ACCENT_SWATCH[a];
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAccent(a)}
                className={`flex h-9 items-center gap-2 rounded-lg border pl-2 pr-3 text-ui transition-[border-color,box-shadow] ${
                  selected ? "border-accent ring-2 ring-ring" : "border-border hover:border-border-strong"
                }`}
              >
                <span
                  className="flex size-5 items-center justify-center rounded-full"
                  style={{ background: mounted && resolvedTheme === "dark" ? swatch.dark : swatch.light }}
                >
                  {selected && <IconCheck size={11} strokeWidth={3} className="text-accent-fg" />}
                </span>
                {swatch.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          Boutons principaux, navigation et éléments sélectionnés. Les couleurs des statuts ne changent pas.
        </p>
      </div>

      <div>
        <p className="label">Taille du texte et de l’interface</p>
        <div className="flex h-9 rounded-lg border border-border bg-surface-2/70 p-0.5" role="radiogroup" aria-label="Taille">
          {SCALES.map((s) => {
            const selected = mounted && scale === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setScale(s)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md text-ui transition-colors ${
                  selected ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted hover:text-fg"
                }`}
              >
                {SCALE_LABEL[s]}
                <span className="num text-2xs text-fg-subtle">{Math.round(Number(s) * 100)}%</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          Agrandit le texte et les espacements sans dézoomer les images ni la carte. Réglage propre à cet appareil.
        </p>
      </div>
    </div>
  );
}
