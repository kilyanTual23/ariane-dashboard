"use client";

import { useSyncExternalStore } from "react";

/** Écran de téléphone ou de tablette : sous ce seuil, l'interface mobile prend le relais. */
export const MOBILE_QUERY = "(max-width: 1023px)";
/** Téléphone seul. */
export const PHONE_QUERY = "(max-width: 767px)";

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

const subscribers = new Map<string, (onChange: () => void) => () => void>();

/** Une requête média suivie en direct, sans décalage d'hydratation (faux côté serveur). */
export function useMedia(query: string) {
  if (!subscribers.has(query)) subscribers.set(query, subscribeTo(query));
  return useSyncExternalStore(
    subscribers.get(query)!,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsMobile = () => useMedia(MOBILE_QUERY);
export const useIsPhone = () => useMedia(PHONE_QUERY);

function subscribeKeyboard(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  return () => vv?.removeEventListener("resize", onChange);
}

/** Clavier virtuel ouvert : la zone visible a nettement rétréci. */
export function useKeyboardOpen() {
  return useSyncExternalStore(
    subscribeKeyboard,
    () => {
      const vv = window.visualViewport;
      return vv ? window.innerHeight - vv.height > 150 : false;
    },
    () => false,
  );
}

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** La page a défilé au-delà d'un seuil (titre compact de la barre mobile). */
export function useScrolledPast(threshold: number) {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > threshold,
    () => false,
  );
}

function subscribeViewport(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
  };
}

/** Hauteur masquée par le clavier virtuel (0 s'il est fermé) : pour garder un tiroir au-dessus. */
export function useKeyboardInset() {
  return useSyncExternalStore(
    subscribeViewport,
    () => {
      const vv = window.visualViewport;
      return vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    },
    () => 0,
  );
}
