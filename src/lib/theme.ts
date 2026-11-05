"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type Scale = "0.9" | "1" | "1.1" | "1.2";

export const SCALES: Scale[] = ["0.9", "1", "1.1", "1.2"];

export type Accent = "violet" | "indigo" | "rose" | "cuivre" | "graphite";
export const ACCENTS: Accent[] = ["violet", "indigo", "rose", "cuivre", "graphite"];

const THEME_KEY = "ariane-theme";
const SCALE_KEY = "ariane-scale";
const ACCENT_KEY = "ariane-accent";
/** Ancienne clé (zoom CSS) : reprise une fois si l'utilisateur l'avait choisie. */
const LEGACY_ZOOM_KEY = "ariane-zoom";
const EVENT = "ariane-appearance-change";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function readScale(): Scale {
  try {
    const s = localStorage.getItem(SCALE_KEY) ?? localStorage.getItem(LEGACY_ZOOM_KEY);
    return (SCALES as string[]).includes(s ?? "") ? (s as Scale) : "1";
  } catch {
    return "1";
  }
}

function readAccent(): Accent {
  try {
    const a = localStorage.getItem(ACCENT_KEY);
    return (ACCENTS as string[]).includes(a ?? "") ? (a as Accent) : "violet";
  } catch {
    return "violet";
  }
}

function prefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readResolved(): "light" | "dark" {
  const theme = readTheme();
  return theme === "dark" || (theme === "system" && prefersDark()) ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  const el = document.documentElement;
  el.setAttribute("data-theme", dark ? "dark" : "light");
  el.setAttribute("data-theme-setting", theme);
  el.classList.toggle("dark", dark);
  el.classList.toggle("light", !dark);
}

export function applyScale(scale: Scale) {
  if (typeof window === "undefined") return;
  document.documentElement.style.setProperty("--app-scale", scale);
}

export function applyAccent(accent: Accent) {
  if (typeof window === "undefined") return;
  // Le violet est la valeur par défaut des feuilles de style : pas d'attribut.
  if (accent === "violet") document.documentElement.removeAttribute("data-accent");
  else document.documentElement.setAttribute("data-accent", accent);
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (readTheme() === "system") applyTheme("system");
    onChange();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) applyTheme(readTheme());
    if (e.key === SCALE_KEY) applyScale(readScale());
    if (e.key === ACCENT_KEY) applyAccent(readAccent());
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}

const noop = () => () => {};

/**
 * Apparence partagée par tous les composants : thème choisi, thème effectif,
 * couleur d'accent et échelle de lisibilité. Lu depuis localStorage, synchronisé
 * entre onglets.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const resolvedTheme = useSyncExternalStore(subscribe, readResolved, () => "light" as const);
  const scale = useSyncExternalStore(subscribe, readScale, () => "1" as Scale);
  const accent = useSyncExternalStore(subscribe, readAccent, () => "violet" as Accent);
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
    window.dispatchEvent(new Event(EVENT));
  };

  const setScale = (next: Scale) => {
    try {
      localStorage.setItem(SCALE_KEY, next);
    } catch {}
    applyScale(next);
    window.dispatchEvent(new Event(EVENT));
  };

  const setAccent = (next: Accent) => {
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {}
    applyAccent(next);
    window.dispatchEvent(new Event(EVENT));
  };

  return { theme, resolvedTheme, setTheme, scale, setScale, accent, setAccent, mounted };
}
