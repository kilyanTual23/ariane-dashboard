"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { saveNotebookAction } from "@/app/actions";
import {
  IconArrowUpRight,
  IconBookOpen,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconLink,
  IconMaximize,
  IconMinimize,
  IconX,
  Spinner,
} from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass, Kbd } from "@/components/ui";
import { MOBILE_QUERY, useIsMobile, useKeyboardInset } from "@/lib/use-media";

/*
 * Carnet : un bloc-notes du profil, ancré en bas de l'écran comme une fenêtre de
 * messagerie. Replié, ce n'est qu'un onglet ; un clic sur l'en-tête le fait monter
 * ou descendre, et la page reste visible et utilisable derrière.
 * Tout s'enregistre seul pendant la frappe, sur tous les appareils.
 */

/* ---------------------------------------------------- état d'affichage */

/** fermé (rien à l'écran), replié (onglet en bas), déplié (fenêtre ouverte). */
export type NotebookState = "closed" | "collapsed" | "expanded";

const STATE_KEY = "ariane-notebook";
const EVENT = "ariane-notebook-change";

let stateInMemory: NotebookState | null = null;

function isMobileNow() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function readState(): NotebookState {
  if (stateInMemory) return stateInMemory;
  // Sur téléphone, le carnet ne s'impose pas : il s'ouvre depuis la barre du haut.
  if (isMobileNow()) return "closed";
  // Sur ordinateur, l'onglet est toujours là, replié, et retrouve son état d'une visite à l'autre.
  try {
    const v = localStorage.getItem(STATE_KEY);
    return v === "expanded" || v === "collapsed" ? v : "collapsed";
  } catch {
    return "collapsed";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function setNotebookState(state: NotebookState) {
  stateInMemory = state;
  if (!isMobileNow() && state !== "closed") {
    try {
      localStorage.setItem(STATE_KEY, state);
    } catch {}
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Barre latérale, raccourci Ctrl . et icône mobile : déplier, ou replier si c'est déjà ouvert. */
export function toggleNotebook() {
  setNotebookState(readState() === "expanded" ? "collapsed" : "expanded");
}

export function useNotebookState() {
  return useSyncExternalStore(subscribe, readState, () => "closed" as NotebookState);
}

/** Vrai quand la fenêtre est dépliée (pour signaler le bouton actif). */
export function useNotebookOpen() {
  return useNotebookState() === "expanded";
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/** Élément affiché en plein écran (la visionneuse d'actes) : le carnet doit s'y loger pour rester visible. */
function useFullscreenHost() {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement,
    () => null,
  );
}

/* ------------------------------------------------------------- outils */

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function today() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** « 2026-11-05 09:42:00 » (UTC, SQLite) → « 10:42 » ou « 4 nov. ». */
function savedLabel(stamp: string | null) {
  if (!stamp) return null;
  const d = new Date(stamp.includes("T") ? stamp : `${stamp.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

type SaveStatus = "saved" | "dirty" | "saving" | "error";

/** Pages citées dans le carnet (« → Titre (/p/…) ») : on y revient d'un clic. */
function citedPages(text: string) {
  const seen = new Set<string>();
  const out: { title: string; href: string }[] = [];
  // Ligne par ligne : le titre est tout ce qui précède le chemin, parenthèses comprises.
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(/\((\/p\/[^\s)]+)\)/g)) {
      const href = m[1];
      if (seen.has(href)) continue;
      seen.add(href);
      const title = line.slice(0, m.index).replace(/^\s*→\s*/, "").trim();
      out.push({ title: title || href, href });
    }
  }
  return out;
}

/** Première ligne non vide : l'aperçu de l'onglet replié. */
function preview(text: string) {
  return text.split("\n").find((l) => l.trim())?.trim() ?? "";
}

/* ------------------------------------------------------------- carnet */

export function Notebook({
  profileId,
  initialContent,
  initialUpdatedAt,
}: {
  profileId: number;
  initialContent: string;
  initialUpdatedAt: string | null;
}) {
  const state = useNotebookState();
  const mobile = useIsMobile();
  const keyboard = useKeyboardInset();
  const fullscreenHost = useFullscreenHost();
  const toast = useToast();

  const [text, setText] = useState(initialContent);
  const [savedAt, setSavedAt] = useState(initialUpdatedAt);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [tall, setTall] = useState(false);
  const [, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const drag = useRef<{ y: number; dy: number; moved: boolean } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Une version plus récente arrive du serveur (autre appareil) : on la prend si rien n'est en cours.
  const [lastInitial, setLastInitial] = useState(initialUpdatedAt);
  if (initialUpdatedAt !== lastInitial) {
    setLastInitial(initialUpdatedAt);
    if (status === "saved" && initialUpdatedAt && (!savedAt || initialUpdatedAt > savedAt)) {
      setText(initialContent);
      setSavedAt(initialUpdatedAt);
    }
  }

  const save = (content: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus("saving");
    startTransition(async () => {
      try {
        const res = await saveNotebookAction({ profileId, content });
        if (!res.ok) throw new Error(res.error);
        // Si l'on a retapé pendant l'enregistrement, la prochaine sauvegarde suivra.
        if (latest.current === content) {
          setStatus("saved");
          setSavedAt(res.updatedAt ?? null);
        }
      } catch (err) {
        setStatus("error");
        toast.error("Carnet non enregistré", errorMessage(err));
      }
    });
  };

  const change = (value: string) => {
    setText(value);
    latest.current = value;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), 700);
  };

  // Rien ne se perd : enregistrement immédiat en repliant, avertissement si l'on quitte trop tôt.
  const flush = () => {
    if (timer.current) save(latest.current);
  };
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (timer.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const collapse = () => {
    flush();
    setNotebookState("collapsed");
  };
  const expand = () => {
    setNotebookState("expanded");
    requestAnimationFrame(() => area.current?.focus({ preventScroll: true }));
  };
  const closeAll = () => {
    flush();
    setNotebookState("closed");
  };

  /** Insère un texte au curseur et garde la frappe là où elle était. */
  const insert = (snippet: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const glue = before && !before.endsWith("\n") ? "\n" : "";
    change(`${before}${glue}${snippet}${text.slice(end)}`);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + glue.length + snippet.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const insertPage = () => {
    const title = document.title.replace(/\s*·\s*Ariane$/, "");
    insert(`→ ${title} (${window.location.pathname})\n`);
  };

  if (state === "closed") return null;
  // En plein écran, seul l'élément concerné est affiché : le carnet le rejoint.
  const place = (node: ReactNode) => (fullscreenHost ? createPortal(node, fullscreenHost) : node);
  const expanded = state === "expanded";

  const statusLabel =
    status === "saving" ? (
      <span className="flex items-center gap-1.5">
        <Spinner size={11} /> Enregistrement…
      </span>
    ) : status === "dirty" ? (
      "Modifications en cours…"
    ) : status === "error" ? (
      <button type="button" onClick={() => save(latest.current)} className="font-medium text-danger underline-offset-4 hover:underline">
        Non enregistré · réessayer
      </button>
    ) : savedAt ? (
      `Enregistré · ${savedLabel(savedAt)}`
    ) : (
      "Enregistrement automatique"
    );

  const pages = citedPages(text);
  const cited =
    pages.length > 0 ? (
      <nav aria-label="Pages citées" className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border px-3 py-2">
        {pages.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            onClick={() => {
              flush();
              if (mobile) setNotebookState("collapsed");
            }}
            className="inline-flex max-w-56 shrink-0 items-center gap-1 rounded-md border border-border bg-surface-2/60 px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            title={`Aller à ${p.title}`}
          >
            <IconArrowUpRight size={11} className="shrink-0 text-fg-subtle" />
            <span className="truncate">{p.title}</span>
          </Link>
        ))}
      </nav>
    ) : null;

  const editor = (
    <textarea
      ref={area}
      value={text}
      onChange={(e) => change(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          collapse();
        }
      }}
      spellCheck
      placeholder={"Hypothèses, pistes, cotes à vérifier, questions à poser…\n\nTout s’enregistre automatiquement, sur tous vos appareils."}
      aria-label="Carnet de notes"
      className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 text-[0.9375rem] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
    />
  );

  const tools = (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={insertPage} className={buttonClass("quiet", "", "icon-sm")} title="Insérer la page actuelle" aria-label="Insérer la page actuelle">
        <IconLink size={14} />
      </button>
      <button type="button" onClick={() => insert(`${today()} — `)} className={buttonClass("quiet", "", "icon-sm")} title="Insérer la date du jour" aria-label="Insérer la date du jour">
        <IconCalendar size={14} />
      </button>
      {!mobile && (
        <button
          type="button"
          onClick={() => setTall((t) => !t)}
          className={buttonClass("quiet", "", "icon-sm")}
          title={tall ? "Hauteur normale" : "Agrandir"}
          aria-label={tall ? "Hauteur normale" : "Agrandir"}
        >
          {tall ? <IconMinimize size={13} /> : <IconMaximize size={13} />}
        </button>
      )}
    </div>
  );

  /** En-tête : on clique pour monter ou descendre le carnet. */
  const header = (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => (expanded ? collapse() : expand())}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (expanded) collapse();
          else expand();
        }
      }}
      title={expanded ? "Replier le carnet" : "Déplier le carnet"}
      className={`flex h-11 shrink-0 cursor-pointer select-none items-center gap-2 pl-3.5 pr-1.5 ${expanded ? "border-b border-border" : ""}`}
    >
      <IconBookOpen size={15} className="shrink-0 text-accent-text" />
      <span className="text-ui font-semibold">Carnet</span>
      <span className="min-w-0 flex-1 truncate text-2xs text-fg-subtle">
        {expanded ? statusLabel : preview(text) || "Noter une idée…"}
      </span>
      {expanded && tools}
      <span className={buttonClass("quiet", "pointer-events-none", "icon-sm")} aria-hidden>
        {expanded ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
      </span>
      {/* Sur téléphone, on peut aussi le faire disparaître tout à fait ; il revient par la barre du haut. */}
      {mobile && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            closeAll();
          }}
          className={buttonClass("quiet", "", "icon-sm")}
          title="Masquer le carnet"
          aria-label="Masquer le carnet"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );

  /* ---- mobile : barre au-dessus des onglets, qui monte à mi-hauteur ---- */
  if (mobile) {
    const height = expanded
      ? keyboard
        ? `min(${tall ? 80 : 46}dvh, calc(100dvh - ${keyboard}px - 4rem))`
        : tall
          ? "80dvh"
          : "46dvh"
      : "2.75rem";
    return place(
      <div
        ref={panel}
        role="complementary"
        aria-label="Carnet"
        className={`fixed z-[60] flex flex-col overflow-hidden border border-border bg-surface shadow-pop ${
          // Replié : une pastille à gauche, qui laisse la place au bouton flottant « + ».
          expanded ? "inset-x-0 rounded-t-2xl border-b-0" : "left-3 w-[calc(100%-6.5rem)] max-w-xs rounded-2xl"
        }`}
        style={{
          // Replié : posé sur la barre d'onglets ; déplié : jusqu'en bas, au-dessus du clavier.
          bottom: expanded ? keyboard : "calc(3.5rem + env(safe-area-inset-bottom) + 0.5rem)",
          height,
          transition: "height 260ms cubic-bezier(0.32, 0.72, 0, 1), bottom 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {expanded && (
          // Poignée : toucher pour agrandir, tirer vers le bas pour replier.
          <div
            className="flex shrink-0 touch-none justify-center pb-0.5 pt-2"
            onPointerDown={(e) => {
              drag.current = { y: e.clientY, dy: 0, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || !panel.current) return;
              d.dy = Math.max(0, e.clientY - d.y);
              d.moved = d.moved || d.dy > 6;
              panel.current.style.transform = `translateY(${d.dy}px)`;
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              if (panel.current) panel.current.style.transform = "";
              if (!d) return;
              if (d.dy > 70) collapse();
              else if (!d.moved) setTall((t) => !t);
            }}
            aria-hidden
          >
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
        )}
        {header}
        {expanded && (
          <>
            {editor}
            {cited}
          </>
        )}
        {expanded && <div className="pb-safe shrink-0" />}
      </div>
    );
  }

  /* ---- ordinateur : fenêtre ancrée en bas à droite, comme une messagerie ---- */
  return place(
    <div
      role="complementary"
      aria-label="Carnet"
      className="fixed bottom-0 right-6 z-[60] hidden w-[22.5rem] flex-col overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface shadow-pop lg:flex"
      style={{
        height: expanded ? (tall ? "calc(100dvh - 4rem)" : "min(30rem, calc(100dvh - 4rem))") : "2.75rem",
        transition: "height 260ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      {header}
      {expanded && (
        <>
          {editor}
          {cited}
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2 text-2xs text-fg-subtle">
            <span className="flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <Kbd>.</Kbd>
              <span className="ml-0.5">monter ou descendre</span>
            </span>
            <span className="num">
              {text.trim() ? text.trim().split(/\s+/).length : 0} mot{text.trim().split(/\s+/).length > 1 ? "s" : ""}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
