"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  createNotebookPageAction,
  deleteNotebookPageAction,
  renameNotebookPageAction,
  saveNotebookPageAction,
} from "@/app/actions";
import {
  IconArrowUpRight,
  IconBookOpen,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconLink,
  IconMaximize,
  IconMinimize,
  IconPlus,
  IconSparkles,
  IconX,
  Spinner,
} from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass, Kbd } from "@/components/ui";
import type { GlobalSearchItem } from "@/components/CommandPalette";
import type { NotebookPage } from "@/lib/queries";
import { searchList } from "@/lib/search";
import { MOBILE_QUERY, useIsMobile, useKeyboardInset } from "@/lib/use-media";

/*
 * Carnet : un bloc-notes du profil, ancré en bas de l'écran comme une fenêtre de
 * messagerie. Replié, ce n'est qu'un onglet ; un clic sur l'en-tête le fait monter
 * ou descendre, et la page reste visible et utilisable derrière.
 * Tout s'enregistre seul pendant la frappe, sur tous les appareils.
 * Plusieurs pages, en onglets : une par recherche, par branche, par acte en cours de lecture…
 * Quand un acte est ouvert dans la visionneuse, une page peut remplir sa fiche (l'IA range les notes).
 * « /Armand » propose les personnes de l'arbre : Tab ou Entrée insère un lien vers sa fiche,
 * écrit [Armand TUAL](/p/…/personnes/12), repris sous la page et ouvrable d'un Ctrl-clic.
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

/* ------------------------------------------- lien avec la visionneuse */

/**
 * Acte ouvert dans la visionneuse : le carnet propose alors de remplir sa fiche avec une page.
 * `sidePanel` : le panneau de transcription occupe la droite ; le carnet se range à sa gauche
 * pour ne pas couvrir le bouton qui reporte les champs dans la fiche.
 */
export type NotebookAct = { title: string; sidePanel?: boolean };

/** Largeur du panneau de transcription de la visionneuse (voir ActViewerModal). */
export const VIEWER_PANEL_WIDTH = "min(40rem, 94vw)";

const ACT_EVENT = "ariane-notebook-act";
/** Le carnet demande à la visionneuse de remplir la fiche avec ces notes. */
export const FILL_EVENT = "ariane-notebook-fill";
const OPEN_PAGE_EVENT = "ariane-notebook-open-page";

let currentAct: NotebookAct | null = null;

function subscribeAct(onChange: () => void) {
  window.addEventListener(ACT_EVENT, onChange);
  return () => window.removeEventListener(ACT_EVENT, onChange);
}

export function setNotebookAct(act: NotebookAct | null) {
  currentAct = act;
  window.dispatchEvent(new Event(ACT_EVENT));
}

function useNotebookAct() {
  return useSyncExternalStore(subscribeAct, () => currentAct, () => null);
}

/** Ouvre le carnet sur la page de ce nom (créée si besoin) : la page de lecture d'un acte. */
export function openNotebookPage(title: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PAGE_EVENT, { detail: { title } }));
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

/** Lien vers une page de l'application, écrit [titre](/p/…). */
const MENTION_RE = /\[([^\]\n]+)\]\((\/p\/[^\s)]+)\)/g;

/** Lien sous le curseur (pour l'ouvrir d'un Ctrl-clic). */
function mentionAt(text: string, pos: number): string | null {
  for (const m of text.matchAll(MENTION_RE)) {
    if (m.index! <= pos && pos <= m.index! + m[0].length) return m[2];
  }
  return null;
}

/** « /Arm » juste avant le curseur, en début de ligne ou après une espace : la recherche en cours. */
function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(?:^|[\s(])\/([^\s/\[\]()][^\n/\[\]()]{0,40})$/);
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
}

/** Pages citées dans le carnet (« → Titre (/p/…) ») : on y revient d'un clic. */
function citedPages(text: string) {
  const seen = new Set<string>();
  const out: { title: string; href: string }[] = [];
  for (const line of text.split("\n")) {
    // Liens nommés : [Armand TUAL](/p/…/personnes/12)
    for (const m of line.matchAll(MENTION_RE)) {
      if (seen.has(m[2])) continue;
      seen.add(m[2]);
      out.push({ title: m[1], href: m[2] });
    }
    // Pages insérées : « → Titre (/p/…) » ; le titre est tout ce qui précède le chemin.
    for (const m of line.replace(MENTION_RE, "").matchAll(/\((\/p\/[^\s)]+)\)/g)) {
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

const PAGE_KEY = "ariane-notebook-page";

function readActivePage(pages: NotebookPage[]): number {
  try {
    const id = Number(localStorage.getItem(PAGE_KEY));
    if (pages.some((p) => p.id === id)) return id;
  } catch {}
  return pages[0]?.id ?? 0;
}

export function Notebook({
  profileId,
  slug,
  people,
  initialPages,
}: {
  profileId: number;
  slug: string;
  /** Personnes de l'arbre, pour les liens « /Nom ». */
  people: GlobalSearchItem[];
  initialPages: NotebookPage[];
}) {
  const router = useRouter();
  const state = useNotebookState();
  const mobile = useIsMobile();
  const keyboard = useKeyboardInset();
  const fullscreenHost = useFullscreenHost();
  const act = useNotebookAct();
  const toast = useToast();

  const [pages, setPages] = useState(initialPages);
  const [activeId, setActiveId] = useState(() => (typeof window === "undefined" ? (initialPages[0]?.id ?? 0) : readActivePage(initialPages)));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [tall, setTall] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dernier texte tapé, et sa page : c'est lui qu'on enregistre. */
  const latest = useRef<{ pageId: number; content: string } | null>(null);
  const drag = useRef<{ y: number; dy: number; moved: boolean } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  /** Position du curseur à rétablir dès que le nouveau texte est affiché (avant toute autre frappe). */
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (pendingCaret.current === null || !el) return;
    el.focus();
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const page = pages.find((p) => p.id === activeId) ?? pages[0];
  const text = page?.content ?? "";
  const savedAt = page?.updated_at ?? null;

  // Des pages plus récentes arrivent du serveur (autre appareil) : on les prend si rien n'est en cours.
  const [lastInitial, setLastInitial] = useState(initialPages);
  if (initialPages !== lastInitial) {
    setLastInitial(initialPages);
    if (status === "saved") {
      setPages((local) =>
        initialPages.map((srv) => {
          const mine = local.find((p) => p.id === srv.id);
          return mine && mine.updated_at && (!srv.updated_at || mine.updated_at >= srv.updated_at) ? mine : srv;
        }),
      );
    }
  }

  const selectPage = (id: number) => {
    flush();
    setActiveId(id);
    setConfirmDelete(null);
    try {
      localStorage.setItem(PAGE_KEY, String(id));
    } catch {}
  };

  const setPageFields = (id: number, fields: Partial<NotebookPage>) =>
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...fields } : p)));

  const save = (pageId: number, content: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus("saving");
    startTransition(async () => {
      try {
        const res = await saveNotebookPageAction({ profileId, pageId, content });
        if (!res.ok) throw new Error(res.error);
        // Si l'on a retapé pendant l'enregistrement, la prochaine sauvegarde suivra.
        if (latest.current?.pageId === pageId && latest.current.content === content) {
          setStatus("saved");
          setPageFields(pageId, { updated_at: res.updatedAt ?? null });
        }
      } catch (err) {
        setStatus("error");
        toast.error("Carnet non enregistré", errorMessage(err));
      }
    });
  };

  const change = (value: string) => {
    if (!page) return;
    const pageId = page.id;
    setPageFields(pageId, { content: value });
    latest.current = { pageId, content: value };
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(pageId, value), 700);
  };

  // Rien ne se perd : enregistrement immédiat en repliant ou en changeant de page, avertissement si l'on quitte trop tôt.
  const flush = () => {
    if (timer.current && latest.current) save(latest.current.pageId, latest.current.content);
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

  /* ---- pages ---- */

  const addPage = async (title: string, focusRename = false): Promise<NotebookPage | null> => {
    flush();
    const res = await createNotebookPageAction({ profileId, title });
    if (!res.ok || !res.page) {
      toast.error("Page non créée", res.error ?? "");
      return null;
    }
    const created = res.page;
    setPages((ps) => [...ps, created]);
    selectPage(created.id);
    if (focusRename) setRenaming(created.id);
    else requestAnimationFrame(() => area.current?.focus({ preventScroll: true }));
    return created;
  };

  const renamePage = (id: number, raw: string) => {
    setRenaming(null);
    const title = raw.replace(/\s+/g, " ").trim();
    const before = pages.find((p) => p.id === id)?.title;
    if (!title || title === before) return;
    setPageFields(id, { title });
    startTransition(async () => {
      const res = await renameNotebookPageAction({ profileId, pageId: id, title });
      if (!res.ok) {
        setPageFields(id, { title: before });
        toast.error("Page non renommée", res.error ?? "");
      }
    });
  };

  const removePage = (id: number) => {
    const target = pages.find((p) => p.id === id);
    if (!target || pages.length < 2) return;
    // Une page écrite se supprime en deux clics ; une page vide, tout de suite.
    if (target.content.trim() && confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    if (latest.current?.pageId === id && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setStatus("saved");
    }
    const rest = pages.filter((p) => p.id !== id);
    setPages(rest);
    if (activeId === id) selectPage(rest[Math.max(0, pages.indexOf(target) - 1)].id);
    startTransition(async () => {
      const res = await deleteNotebookPageAction({ profileId, pageId: id });
      if (!res.ok) {
        setPages(pages);
        toast.error("Page non supprimée", res.error ?? "");
      }
    });
  };

  // La visionneuse demande la page de lecture d'un acte : on la retrouve par son nom, ou on la crée.
  // (Réabonné à chaque rendu : l'écouteur voit toujours les pages à jour.)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const title = (e as CustomEvent<{ title: string }>).detail?.title;
      if (!title) return;
      setNotebookState("expanded");
      const found = pages.find((p) => p.title === title);
      if (!found) return void addPage(title);
      selectPage(found.id);
      requestAnimationFrame(() => area.current?.focus({ preventScroll: true }));
    };
    window.addEventListener(OPEN_PAGE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
  });

  /** Remplir la fiche de l'acte ouvert : la sélection si l'on en a fait une, sinon toute la page. */
  const fillAct = () => {
    const el = area.current;
    const selected = el && el.selectionEnd > el.selectionStart ? text.slice(el.selectionStart, el.selectionEnd) : "";
    const notes = (selected || text).trim();
    if (!notes) return;
    flush();
    window.dispatchEvent(new CustomEvent(FILL_EVENT, { detail: { notes } }));
    // Replié, il laisse voir les champs remplis à vérifier dans la visionneuse.
    setNotebookState("collapsed");
  };

  /** Insère un texte au curseur et garde la frappe là où elle était. */
  const insert = (snippet: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const glue = before && !before.endsWith("\n") ? "\n" : "";
    pendingCaret.current = before.length + glue.length + snippet.length;
    change(`${before}${glue}${snippet}${text.slice(end)}`);
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
      <button type="button" onClick={() => latest.current && save(latest.current.pageId, latest.current.content)} className="font-medium text-danger underline-offset-4 hover:underline">
        Non enregistré · réessayer
      </button>
    ) : savedAt ? (
      `Enregistré · ${savedLabel(savedAt)}`
    ) : (
      "Enregistrement automatique"
    );

  const links = citedPages(text);
  const cited =
    links.length > 0 ? (
      <nav aria-label="Pages citées" className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border px-3 py-2">
        {links.map((p) => (
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

  /* ---- liens « /Nom » vers les fiches ---- */

  const suggestions = mention
    ? searchList(
        people,
        mention.query,
        (p) => ({ name: p.name, givenNames: p.givenNames, surname: p.surname, sosa: p.sosa, birthYear: p.birthYear, deathYear: p.deathYear }),
        6,
      )
    : [];
  const mentionOpen = Boolean(mention && suggestions.length);

  /** Relit le texte autour du curseur : une recherche « /… » est-elle en cours ? */
  const syncMention = (el: HTMLTextAreaElement) => {
    const found = el.selectionStart === el.selectionEnd ? mentionQuery(el.value, el.selectionStart) : null;
    setMention((cur) => (cur?.start === found?.start && cur?.query === found?.query ? cur : found));
    if (found?.query !== mention?.query) setMentionIndex(0);
  };

  const pickMention = (person: GlobalSearchItem) => {
    const el = area.current;
    if (!mention || !el) return;
    const caret = el.selectionStart;
    const link = `[${person.name}](/p/${slug}/personnes/${person.id}) `;
    pendingCaret.current = mention.start + link.length;
    change(text.slice(0, mention.start) + link + text.slice(caret));
    setMention(null);
  };

  const mentionList = mentionOpen ? (
    <div role="listbox" aria-label="Personnes" className="shrink-0 border-t border-border bg-surface-2/50 p-1">
      {suggestions.map((p, i) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={i === mentionIndex}
          // mousedown : on garde le focus (et le curseur) dans la page.
          onMouseDown={(e) => {
            e.preventDefault();
            pickMention(p);
          }}
          onMouseEnter={() => setMentionIndex(i)}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs ${
            i === mentionIndex ? "bg-surface text-fg shadow-xs" : "text-fg-muted"
          }`}
        >
          <span className="min-w-0 flex-1 truncate font-medium text-fg">{p.name}</span>
          {(p.birthYear || p.deathYear) && (
            <span className="num shrink-0 text-fg-subtle">
              {p.birthYear ?? "?"}–{p.deathYear ?? ""}
            </span>
          )}
          {p.sosa ? <span className="num shrink-0 rounded bg-accent-soft px-1 text-2xs text-accent-text">Sosa {p.sosa}</span> : null}
        </button>
      ))}
      <p className="px-2.5 pb-0.5 pt-1 text-2xs text-fg-subtle">
        <Kbd>Tab</Kbd> ou <Kbd>Entrée</Kbd> pour insérer le lien · <Kbd>Échap</Kbd> pour fermer
      </p>
    </div>
  ) : null;

  const editor = (
    <textarea
      ref={area}
      value={text}
      onChange={(e) => {
        change(e.target.value);
        syncMention(e.target);
      }}
      onSelect={(e) => syncMention(e.currentTarget)}
      onBlur={() => {
        flush();
        setMention(null);
      }}
      onClick={(e) => {
        // Ctrl-clic (ou Cmd-clic) sur un lien : on ouvre la fiche.
        if (!(e.ctrlKey || e.metaKey)) return;
        const href = mentionAt(text, e.currentTarget.selectionStart);
        if (!href) return;
        flush();
        router.push(href);
        if (mobile) setNotebookState("collapsed");
      }}
      onKeyDown={(e) => {
        if (mentionOpen) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = suggestions.length;
            setMentionIndex((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            return;
          }
          if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
            pickMention(suggestions[Math.min(mentionIndex, suggestions.length - 1)]);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setMention(null);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          collapse();
        }
      }}
      spellCheck
      placeholder={
        act
          ? "Lisez l’acte et notez ce que vous y voyez : date, lieu, parents, âges, parrains… Abréviations et désordre permis.\n\nPuis « Remplir la fiche » : l’IA range vos notes dans les champs, sans rien inventer."
          : "Hypothèses, pistes, cotes à vérifier, questions à poser…\n\nTapez / suivi d’un nom (/Armand) pour lier une fiche. Tout s’enregistre automatiquement, sur tous vos appareils."
      }
      aria-label={page ? `Carnet, page ${page.title}` : "Carnet de notes"}
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

  /** Onglets : une page par sujet. Double-clic pour renommer. */
  const tabs = (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5" role="tablist" aria-label="Pages du carnet">
      {pages.map((p) => {
        const active = p.id === page?.id;
        if (renaming === p.id) {
          return (
            <input
              key={p.id}
              autoFocus
              defaultValue={p.title}
              maxLength={80}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => renamePage(p.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenaming(null);
              }}
              aria-label="Nom de la page"
              className="h-7 w-36 shrink-0 rounded-md border border-border-strong bg-surface px-2 text-xs text-fg outline-none"
            />
          );
        }
        return (
          <div
            key={p.id}
            className={`group/tab flex h-7 max-w-44 shrink-0 items-center rounded-md text-xs transition-colors ${
              active ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => (active ? setRenaming(p.id) : selectPage(p.id))}
              onDoubleClick={() => setRenaming(p.id)}
              title={active ? "Renommer la page" : p.title}
              className="h-full min-w-0 truncate px-2"
            >
              {p.title}
            </button>
            {active && pages.length > 1 && (
              <button
                type="button"
                onClick={() => removePage(p.id)}
                onBlur={() => setConfirmDelete(null)}
                className={`mr-0.5 flex h-5 shrink-0 items-center justify-center rounded px-1 transition-colors ${
                  confirmDelete === p.id ? "bg-danger-soft text-danger" : "text-fg-subtle hover:bg-surface hover:text-fg"
                }`}
                title="Supprimer la page"
                aria-label={confirmDelete === p.id ? "Confirmer la suppression de la page" : "Supprimer la page"}
              >
                {confirmDelete === p.id ? <span className="text-2xs font-medium">Supprimer ?</span> : <IconX size={11} />}
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => void addPage(`Page ${pages.length + 1}`, true)}
        className={buttonClass("quiet", "shrink-0", "icon-sm")}
        title="Nouvelle page"
        aria-label="Nouvelle page"
      >
        <IconPlus size={14} />
      </button>
    </div>
  );

  /** Un acte est ouvert dans la visionneuse : la page peut remplir sa fiche. */
  const fillBar = act ? (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-accent-soft/40 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-2xs text-fg-muted" title={act.title}>
        {act.title}
      </span>
      <button
        type="button"
        onClick={fillAct}
        disabled={!text.trim()}
        className={buttonClass("primary", "shrink-0", "sm")}
        title="L’IA range les notes de cette page (ou le passage sélectionné) dans les champs de la fiche"
      >
        <IconSparkles size={13} />
        Remplir la fiche
      </button>
    </div>
  ) : null;

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
        {expanded ? statusLabel : (pages.length > 1 && page ? `${page.title} · ` : "") + (preview(text) || "Noter une idée…")}
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
            {tabs}
            {editor}
            {mentionList}
            {cited}
            {fillBar}
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
      className="fixed bottom-0 z-[60] hidden w-[22.5rem] flex-col overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface shadow-pop lg:flex"
      style={{
        right: act?.sidePanel ? `calc(${VIEWER_PANEL_WIDTH} + 1.5rem)` : "1.5rem",
        height: expanded ? (tall ? "calc(100dvh - 4rem)" : "min(30rem, calc(100dvh - 4rem))") : "2.75rem",
        transition: "height 260ms cubic-bezier(0.32, 0.72, 0, 1), right 260ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      {header}
      {expanded && (
        <>
          {tabs}
          {editor}
          {mentionList}
          {cited}
          {fillBar}
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
