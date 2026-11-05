"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { pushRecent } from "@/lib/recent";

/**
 * Effets de la page fiche : mémorise la visite (palette de commandes) et
 * passe à la fiche suivante ou précédente avec J / K, ou d'un glissement du doigt.
 */
export function PersonPageEffects({
  slug,
  personId,
  prevHref,
  nextHref,
}: {
  slug: string;
  personId: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    pushRecent(slug, personId);
  }, [slug, personId]);

  useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }
      if (e.key === "j" && nextHref) router.push(nextHref);
      if (e.key === "k" && prevHref) router.push(prevHref);
    };
    // Sur écran tactile : un glissement franc vers la gauche ou la droite change de fiche.
    let start: { x: number; y: number; t: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.touches.length !== 1 ||
        document.querySelector("dialog[open]") ||
        target?.closest("input, textarea, select, [contenteditable], [data-no-swipe], .overflow-x-auto")
      ) {
        start = null;
        return;
      }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = Date.now() - start.t < 600;
      start = null;
      if (!quick || Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
      if (dx < 0 && nextHref) router.push(nextHref);
      if (dx > 0 && prevHref) router.push(prevHref);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [router, prevHref, nextHref]);

  return null;
}
