"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ZoomLevel = "1" | "1.1" | "1.2";

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;

  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const el = document.documentElement;
  el.setAttribute("data-theme", isDark ? "dark" : "light");
  el.setAttribute("data-theme-setting", theme);

  if (isDark) {
    el.classList.add("dark");
    el.classList.remove("light");
  } else {
    el.classList.add("light");
    el.classList.remove("dark");
  }

  window.dispatchEvent(new CustomEvent("ariane-theme-change", { detail: theme }));
}

export function applyZoom(zoom: ZoomLevel) {
  if (typeof window === "undefined") return;
  document.documentElement.style.setProperty("--app-zoom", zoom);
  window.dispatchEvent(new CustomEvent("ariane-zoom-change", { detail: zoom }));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [zoom, setZoomState] = useState<ZoomLevel>("1.1");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem("ariane-theme") as Theme) || "system";
    setThemeState(stored);

    const storedZoom = (localStorage.getItem("ariane-zoom") as ZoomLevel) || "1.1";
    setZoomState(storedZoom);
    applyZoom(storedZoom);

    const updateResolved = () => {
      const currentSetting = (localStorage.getItem("ariane-theme") as Theme) || "system";
      const isDark =
        currentSetting === "dark" ||
        (currentSetting === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      setResolvedTheme(isDark ? "dark" : "light");
    };

    updateResolved();

    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<Theme>;
      if (custom.detail) {
        setThemeState(custom.detail);
        updateResolved();
      }
    };

    const handleZoomChange = (e: Event) => {
      const custom = e as CustomEvent<ZoomLevel>;
      if (custom.detail) {
        setZoomState(custom.detail);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "ariane-theme" && e.newValue) {
        setThemeState(e.newValue as Theme);
        applyTheme(e.newValue as Theme);
        updateResolved();
      }
      if (e.key === "ariane-zoom" && e.newValue) {
        setZoomState(e.newValue as ZoomLevel);
        applyZoom(e.newValue as ZoomLevel);
      }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMedia = () => {
      const current = (localStorage.getItem("ariane-theme") as Theme) || "system";
      if (current === "system") {
        applyTheme("system");
        updateResolved();
      }
    };

    window.addEventListener("ariane-theme-change", handleThemeChange);
    window.addEventListener("ariane-zoom-change", handleZoomChange);
    window.addEventListener("storage", handleStorage);
    mediaQuery.addEventListener("change", handleMedia);

    return () => {
      window.removeEventListener("ariane-theme-change", handleThemeChange);
      window.removeEventListener("ariane-zoom-change", handleZoomChange);
      window.removeEventListener("storage", handleStorage);
      mediaQuery.removeEventListener("change", handleMedia);
    };
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("ariane-theme", newTheme);
    applyTheme(newTheme);
    const isDark =
      newTheme === "dark" ||
      (newTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedTheme(isDark ? "dark" : "light");
  };

  const setZoom = (newZoom: ZoomLevel) => {
    setZoomState(newZoom);
    localStorage.setItem("ariane-zoom", newZoom);
    applyZoom(newZoom);
  };

  return { theme, resolvedTheme, setTheme, zoom, setZoom, mounted };
}
