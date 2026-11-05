"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { IconArrowUpRight, IconMaximize, IconMinus, IconPanelRight, IconPlus, IconTarget } from "@/components/icons";
import { SlotStrip } from "@/components/PersonCard";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { Toggle } from "@/components/Toggle";
import { buttonClass, COMPLETION_COLOR, Kbd, StatusDot } from "@/components/ui";
import { TREE_PANEL_COOKIE } from "@/lib/tree";
import { useIsPhone } from "@/lib/use-media";
import type { Status } from "@/lib/types";

/* ------------------------------------------------------------------ données */

export type TreePerson = {
  id: number;
  given: string;
  surname: string;
  sex: "M" | "F" | null;
  birthYear: number | null;
  birthYearEstimated: boolean;
  deathYear: number | null;
  isLiving: boolean;
  sosa: number | null;
  status: Status;
  score: number;
  total: number;
  parents: number[];
  children: number[];
  spouses: number[];
};

/* ---------------------------------------------------------------- géométrie */

/**
 * Plus on remonte, plus les cartes se resserrent : la personne, ses parents et
 * sa descendance gardent une carte lisible, les générations anciennes tiennent
 * dans des cartes étroites pour en afficher le plus possible.
 */
type Tier = { w: number; h: number; gap: number };
const TIERS: Tier[] = [
  { w: 168, h: 62, gap: 14 }, // la personne, sa rangée, ses parents, sa descendance
  { w: 142, h: 58, gap: 10 }, // grands-parents
  { w: 120, h: 54, gap: 8 }, // arrière-grands-parents
  { w: 96, h: 46, gap: 6 },
  { w: 78, h: 42, gap: 4 },
];
const VG = 38; // écart vertical entre deux générations
const SG = 30; // écart entre la personne et son conjoint

const tierOf = (level: number) => (level >= -1 ? 0 : Math.min(TIERS.length - 1, -level - 1));
const sizeOf = (level: number) => TIERS[tierOf(level)];

/** Ordonnée du centre d'une rangée : les rangées hautes, plus basses, se resserrent aussi. */
function rowY(level: number): number {
  let y = 0;
  if (level < 0) for (let l = 0; l > level; l--) y -= sizeOf(l).h / 2 + VG + sizeOf(l - 1).h / 2;
  else for (let l = 0; l < level; l++) y += sizeOf(l).h / 2 + VG + sizeOf(l + 1).h / 2;
  return y;
}

type Role = "father" | "mother" | "parents";

type NodeBox =
  | {
      key: string;
      kind: "person";
      id: number;
      x: number;
      y: number;
      level: number;
      w: number;
      h: number;
    }
  | {
      key: string;
      kind: "empty";
      childId: number;
      role: Role;
      x: number;
      y: number;
      level: number;
      w: number;
      h: number;
    };

type Edge = { key: string; d: string; dashed?: boolean };

type Layout = {
  nodes: NodeBox[];
  edges: Edge[];
  marks: { key: string; x: number; y: number }[];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  levels: number[];
  father: number | null;
  mother: number | null;
  siblings: number[];
  children: number[];
  ancestorsShown: number;
  ancestorsPossible: number;
};

const CORNER = 6;
const LINE = "color-mix(in srgb, var(--fg-subtle) 40%, var(--border-strong))";

/** Retard d'apparition : les cartes se dévoilent en vague depuis la personne au centre. */
function rippleDelay(x: number, y: number) {
  return Math.min(650, Math.round(Math.hypot(x, y * 1.5) * 0.55));
}

/** Point de départ d'un trait, pour l'animer au même rythme que les cartes. */
function edgeOrigin(d: string): [number, number] {
  const m = /^M (\S+) (\S+)/.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/** Trait vertical d'une carte jusqu'à la barre de la famille. */
function stem(x: number, y1: number, y2: number) {
  return `M ${x} ${y1} V ${y2}`;
}

/** Trait en équerre : à l'horizontale le long de la barre, puis à la verticale vers une carte. */
function elbow(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 0.5) return `M ${x1} ${y1} V ${y2}`;
  const r = Math.min(CORNER, Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  return `M ${x1} ${y1} H ${x2 - sx * r} Q ${x2} ${y1} ${x2} ${y1 + sy * r} V ${y2}`;
}

function parentsOf(byId: Map<number, TreePerson>, id: number): [number | null, number | null] {
  const refs = (byId.get(id)?.parents ?? []).map((pid) => byId.get(pid)).filter((p): p is TreePerson => !!p);
  const father = refs.find((p) => p.sex === "M") ?? refs.find((p) => p.sex !== "F") ?? null;
  const mother =
    refs.find((p) => p.sex === "F" && p.id !== father?.id) ?? refs.find((p) => p.id !== father?.id) ?? null;
  return [father?.id ?? null, mother?.id ?? null];
}

function byBirth(byId: Map<number, TreePerson>) {
  return (a: number, b: number) =>
    (byId.get(a)?.birthYear ?? 9999) - (byId.get(b)?.birthYear ?? 9999) ||
    (byId.get(a)?.given ?? "").localeCompare(byId.get(b)?.given ?? "", "fr");
}

type ATree = {
  id: number | null;
  role?: Role;
  childId?: number;
  width: number;
  parents: ATree[];
};
type DTree = { id: number; width: number; children: DTree[] };

/**
 * Disposition de l'arbre autour de la personne au centre (0, 0) :
 * ascendants au-dessus, fratrie à gauche, conjoints à droite, descendance dessous.
 * Les branches inconnues ne prennent qu'une case, pour garder l'arbre compact.
 */
function computeLayout(
  byId: Map<number, TreePerson>,
  focusId: number,
  up: number,
  down: number,
  withSiblings: boolean,
): Layout {
  const nodes: NodeBox[] = [];
  const edges: Edge[] = [];
  const marks: Layout["marks"] = [];
  const seen = new Map<number, number>();
  const keyFor = (id: number) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n ? `p${id}-${n}` : `p${id}`;
  };
  const sort = byBirth(byId);
  const base = TIERS[0];

  // --- ascendance : « depth » générations au-dessus de la personne
  let ancestorsShown = 0;
  const empty = (role: Role, childId: number, depth: number): ATree => ({
    id: null,
    role,
    childId,
    width: sizeOf(-depth).w,
    parents: [],
  });
  const buildUp = (id: number, depth: number): ATree => {
    const own = sizeOf(-depth).w;
    if (depth >= up) return { id, width: own, parents: [] };
    const [f, m] = parentsOf(byId, id);
    const slots =
      !f && !m
        ? [empty("parents", id, depth + 1)]
        : [
            f ? buildUp(f, depth + 1) : empty("father", id, depth + 1),
            m ? buildUp(m, depth + 1) : empty("mother", id, depth + 1),
          ];
    const gap = sizeOf(-(depth + 1)).gap;
    const width = Math.max(own, slots.reduce((s, t) => s + t.width, 0) + gap * (slots.length - 1));
    return { id, width, parents: slots };
  };

  const placeUp = (t: ATree, cx: number, depth: number) => {
    const level = -depth;
    const { w, h } = sizeOf(level);
    const y = rowY(level);
    let nodeKey = "focus";
    if (t.id !== null && depth > 0) {
      nodeKey = keyFor(t.id);
      nodes.push({
        key: nodeKey,
        kind: "person",
        id: t.id,
        x: cx,
        y,
        level,
        w,
        h,
      });
      ancestorsShown++;
    } else if (t.id === null) {
      nodeKey = `e${t.childId}-${t.role}`;
      nodes.push({
        key: nodeKey,
        kind: "empty",
        childId: t.childId!,
        role: t.role!,
        x: cx,
        y,
        level,
        w,
        h,
      });
    }
    if (!t.parents.length) return;
    // Barre de la famille à mi-hauteur : l'enfant y monte, chaque parent y descend.
    const up1 = sizeOf(level - 1);
    const parentBottom = rowY(level - 1) + up1.h / 2;
    const bar = (y - h / 2 + parentBottom) / 2;
    edges.push({
      key: `us-${nodeKey}`,
      d: stem(cx, y - h / 2, bar),
      dashed: t.parents.every((p) => p.id === null),
    });
    const total = t.parents.reduce((s, p) => s + p.width, 0) + up1.gap * (t.parents.length - 1);
    let start = cx - total / 2;
    for (const p of t.parents) {
      const px = start + p.width / 2;
      edges.push({
        key: `u-${nodeKey}-${p.role ?? p.id}`,
        d: elbow(cx, bar, px, parentBottom),
        dashed: p.id === null,
      });
      placeUp(p, px, depth + 1);
      start += p.width + up1.gap;
    }
  };

  const up0 = buildUp(focusId, 0);
  placeUp(up0, 0, 0);
  const [father, mother] = parentsOf(byId, focusId);

  // --- la personne au centre
  nodes.push({
    key: keyFor(focusId),
    kind: "person",
    id: focusId,
    x: 0,
    y: 0,
    level: 0,
    w: base.w,
    h: base.h,
  });

  // --- fratrie, à gauche, reliée au couple parental
  const focus = byId.get(focusId)!;
  const siblingSet = new Set<number>();
  for (const pid of focus.parents) for (const c of byId.get(pid)?.children ?? []) if (c !== focusId) siblingSet.add(c);
  const siblings = [...siblingSet].filter((id) => byId.has(id)).sort(sort);
  if (withSiblings && siblings.length && up > 0) {
    // Frères et sœurs accrochés à la même barre que la personne au centre.
    const bar = (-base.h / 2 + rowY(-1) + sizeOf(-1).h / 2) / 2;
    siblings.forEach((sid, i) => {
      const x = -(siblings.length - i) * (base.w + base.gap);
      nodes.push({
        key: keyFor(sid),
        kind: "person",
        id: sid,
        x,
        y: 0,
        level: 0,
        w: base.w,
        h: base.h,
      });
      edges.push({ key: `s-${sid}`, d: elbow(0, bar, x, -base.h / 2) });
    });
  }

  // --- conjoints, à droite
  const spouses = focus.spouses.filter((id) => byId.has(id));
  const spouseX = new Map<number, number>();
  spouses.forEach((sid, i) => {
    const x = (i + 1) * (base.w + SG);
    spouseX.set(sid, x);
    nodes.push({
      key: keyFor(sid),
      kind: "person",
      id: sid,
      x,
      y: 0,
      level: 0,
      w: base.w,
      h: base.h,
    });
    edges.push({
      key: `m-${sid}`,
      d: `M ${x - SG - base.w / 2} 0 L ${x - base.w / 2} 0`,
    });
    marks.push({ key: `mk-${sid}`, x: x - (base.w + SG) / 2, y: 0 });
  });

  // --- descendance, regroupée par couple
  const children = focus.children.filter((id) => byId.has(id)).sort(sort);
  if (down > 0 && children.length) {
    const buildDown = (id: number, depth: number): DTree => {
      const kids = depth < down ? (byId.get(id)?.children ?? []).filter((c) => byId.has(c)).sort(sort) : [];
      const sub = kids.map((k) => buildDown(k, depth + 1));
      const width = Math.max(base.w, sub.reduce((s, t) => s + t.width, 0) + base.gap * Math.max(0, sub.length - 1));
      return { id, width, children: sub };
    };
    // Barre sous une rangée, à mi-chemin de la rangée suivante.
    const barBelow = (level: number) => (rowY(level) + rowY(level + 1)) / 2;
    const placeDown = (t: DTree, cx: number, level: number) => {
      const y = rowY(level);
      nodes.push({
        key: keyFor(t.id),
        kind: "person",
        id: t.id,
        x: cx,
        y,
        level,
        w: base.w,
        h: base.h,
      });
      if (!t.children.length) return;
      const bar = barBelow(level);
      edges.push({
        key: `ds-${t.id}-${level}`,
        d: stem(cx, y + base.h / 2, bar),
      });
      const total = t.children.reduce((s, c) => s + c.width, 0) + base.gap * Math.max(0, t.children.length - 1);
      let start = cx - total / 2;
      for (const c of t.children) {
        const x = start + c.width / 2;
        edges.push({
          key: `d-${c.id}-${level + 1}`,
          d: elbow(cx, bar, x, rowY(level + 1) - base.h / 2),
        });
        placeDown(c, x, level + 1);
        start += c.width + base.gap;
      }
    };

    // Chaque enfant rejoint le couple formé avec son autre parent, sinon la personne seule.
    const groups = new Map<number | null, number[]>();
    for (const c of children) {
      const other = (byId.get(c)?.parents ?? []).find((p) => p !== focusId && spouseX.has(p)) ?? null;
      groups.set(other, [...(groups.get(other) ?? []), c]);
    }
    const ordered = [...groups.entries()].sort(
      ([a], [b]) => (a === null ? 0 : spouseX.get(a)!) - (b === null ? 0 : spouseX.get(b)!),
    );
    // Une barre par couple, légèrement décalées en hauteur pour ne jamais se confondre.
    const step = ordered.length > 1 ? Math.min(8, (VG - 14) / (ordered.length - 1)) : 0;
    let cursor = -Infinity;
    ordered.forEach(([spouse, kids], g) => {
      const anchorX = spouse === null ? 0 : spouseX.get(spouse)! - (base.w + SG) / 2;
      const anchorY = spouse === null ? base.h / 2 : 0;
      const bar = barBelow(0) + (g - (ordered.length - 1) / 2) * step;
      edges.push({
        key: `ds-${focusId}-${spouse ?? "seul"}`,
        d: stem(anchorX, anchorY, bar),
      });
      const trees = kids.map((k) => buildDown(k, 1));
      const total = trees.reduce((s, t) => s + t.width, 0) + base.gap * (trees.length - 1);
      let start = Math.max(anchorX - total / 2, cursor + base.gap);
      for (const t of trees) {
        const x = start + t.width / 2;
        edges.push({
          key: `d-${t.id}-1`,
          d: elbow(anchorX, bar, x, rowY(1) - base.h / 2),
        });
        placeDown(t, x, 1);
        start += t.width + base.gap;
      }
      cursor = start - base.gap;
    });
  }

  const bbox = {
    minX: Math.min(...nodes.map((n) => n.x - n.w / 2)),
    maxX: Math.max(...nodes.map((n) => n.x + n.w / 2)),
    minY: Math.min(...nodes.map((n) => n.y - n.h / 2)),
    maxY: Math.max(...nodes.map((n) => n.y + n.h / 2)),
  };
  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);

  return {
    nodes,
    edges,
    marks,
    bbox,
    levels,
    father,
    mother,
    siblings,
    children,
    ancestorsShown,
    ancestorsPossible: 2 ** (up + 1) - 2,
  };
}

const LEVEL_LABEL: Record<string, string> = {
  "-1": "Parents",
  "-2": "Grands-parents",
  "-3": "Arrière-grands-parents",
  "-4": "Trisaïeux",
  "-5": "Quadrisaïeux",
  "1": "Enfants",
  "2": "Petits-enfants",
};

const ROLE_LABEL: Record<Role, string> = {
  father: "Père",
  mother: "Mère",
  parents: "Parents",
};

/* -------------------------------------------------------------------- carte */

function yearsOf(p: TreePerson, compact: boolean) {
  const b = p.birthYear ? `${p.birthYearEstimated ? "~" : ""}${p.birthYear}` : "?";
  const sep = compact ? "–" : " – ";
  if (p.isLiving) return compact ? b : `${b} – vivant`;
  return `${b}${sep}${p.deathYear ?? "?"}`;
}

/**
 * La carte de l'arbre : pastille de statut, nom, années, cases remplies.
 * Elle s'allège à mesure qu'on remonte : nom de famille seul, puis plus de compteur.
 */
function PersonNode({
  slug,
  person,
  tier,
  focused,
  isRoot,
  onFocus,
}: {
  slug: string;
  person: TreePerson;
  tier: number;
  focused: boolean;
  isRoot: boolean;
  onFocus: () => void;
}) {
  const first = person.given.split(/\s+/)[0] ?? "";
  const fullName = `${person.given} ${person.surname}`.trim() || "Sans nom";
  const compact = tier >= 3;
  const name = compact ? person.surname || first || "?" : `${first} ${person.surname}`.trim() || "Sans nom";
  const textSize = tier === 0 ? "text-ui" : tier <= 2 ? "text-xs" : "text-2xs";

  return (
    <div className="group relative h-full w-full">
      <button
        type="button"
        onClick={onFocus}
        title={`${fullName}${focused ? "" : " · centrer l’arbre sur cette personne"}`}
        className={`flex h-full w-full flex-col justify-center rounded-xl border bg-surface text-left transition-[box-shadow,border-color] duration-200 ${
          tier >= 2 ? "px-2" : "px-3"
        } ${
          focused
            ? "border-accent shadow-card ring-2 ring-ring"
            : "border-border shadow-xs hover:border-border-strong hover:shadow-card"
        }`}
      >
        <span className={`flex min-w-0 items-center gap-1.5 ${tier <= 1 ? "pr-5" : ""}`}>
          <StatusDot status={person.status} className="size-1.5" />
          <span className={`truncate font-medium leading-tight ${textSize}`}>{name}</span>
        </span>
        <span className="num mt-1 flex items-center justify-between gap-1 text-2xs leading-none text-fg-subtle">
          <span className="flex min-w-0 items-center gap-1 truncate">
            {yearsOf(person, tier >= 2)}
            {isRoot ? (
              <span className="rounded bg-accent px-1 text-[0.5625rem] font-semibold leading-3.5 text-accent-fg">G1</span>
            ) : person.sosa && tier <= 1 ? (
              <span>#{person.sosa}</span>
            ) : null}
          </span>
          {tier === 0 && (
            <span className="shrink-0">
              {person.score}/{person.total}
            </span>
          )}
        </span>
        {compact ? (
          <span className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(person.score / Math.max(1, person.total)) * 100}%`,
                background: COMPLETION_COLOR,
              }}
            />
          </span>
        ) : (
          <SlotStrip score={person.score} total={person.total} missing={[]} className="mt-1.5" />
        )}
      </button>
      <Link
        href={`/p/${slug}/personnes/${person.id}`}
        title="Ouvrir la fiche"
        aria-label={`Ouvrir la fiche de ${fullName}`}
        className={`absolute flex items-center justify-center rounded-md text-fg-subtle transition-[opacity,background-color,color] hover:bg-surface-2 hover:text-fg ${
          tier <= 1 ? "right-1 top-1 size-6" : "-right-1.5 -top-1.5 size-5 border border-border bg-surface shadow-xs"
        } ${focused || tier <= 1 ? "opacity-60 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
      >
        <IconArrowUpRight size={tier <= 1 ? 13 : 11} />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ l'arbre */


type Cam = { x: number; y: number; k: number };

export function FamilyTree({
  slug,
  people,
  initialFocus,
  initialUp,
  initialPanelOpen,
  rootId,
}: {
  slug: string;
  people: TreePerson[];
  initialFocus: number;
  initialUp: number;
  initialPanelOpen: boolean;
  rootId: number | null;
}) {
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const [focus, setFocus] = useState(initialFocus);
  const [gen, setGen] = useState(initialUp);
  const [down, setDown] = useState(1);
  const [withSiblings, setWithSiblings] = useState(true);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [cam, setCam] = useState<Cam | null>(null);
  const [instant, setInstant] = useState(false);
  const [panelOpen, setPanelOpenState] = useState(initialPanelOpen);
  // Sur téléphone, le panneau recouvre l'arbre : fermé au départ, sans toucher au réglage de l'ordinateur.
  const narrow = useIsPhone();
  const [mobilePanel, setMobilePanel] = useState(false);
  const panelShown = narrow ? mobilePanel : panelOpen;
  const setPanelOpen = (open: boolean) => {
    if (narrow) {
      setMobilePanel(open);
      return;
    }
    setPanelOpenState(open);
    document.cookie = `${TREE_PANEL_COOKIE}=${open ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
  };

  const viewport = useRef<HTMLDivElement>(null);
  const effectiveRef = useRef<Cam>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{
    x: number;
    y: number;
    cam: Cam;
    moved: boolean;
    id: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    dist: number;
    cam: Cam;
    cx: number;
    cy: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layout = useMemo(
    () => computeLayout(byId, focus, gen - 1, down, withSiblings),
    [byId, focus, gen, down, withSiblings],
  );

  // Cadrage automatique : la personne choisie au centre exact de l'écran, zoomée pour montrer
  // le plus possible autour d'elle. « fit » cadre l'arbre entier.
  const autoCam = useCallback(
    (mode: "auto" | "fit" = "auto"): Cam => {
      if (!size) return { x: 0, y: 0, k: 1 };
      const { minX, maxX, minY, maxY } = layout.bbox;
      const bw = maxX - minX + 140;
      const bh = maxY - minY + 80;
      if (mode === "fit") {
        const k = Math.max(0.2, Math.min(size.w / bw, size.h / bh, 1));
        return {
          k,
          x: size.w / 2 - ((minX + maxX) / 2) * k,
          y: size.h / 2 - ((minY + maxY) / 2) * k,
        };
      }
      // Demi-étendue de l'arbre autour de la personne (placée en 0, 0).
      const halfW = Math.max(-minX, maxX) + 48;
      const halfH = Math.max(-minY, maxY) + 32;
      const k = Math.min(1, Math.max(0.65, Math.min(size.w / (2 * halfW), size.h / (2 * halfH))));
      return { k, x: size.w / 2, y: size.h / 2 };
    },
    [size, layout.bbox],
  );

  const view = cam ?? autoCam();

  useEffect(() => {
    effectiveRef.current = view;
  });

  // Taille de la zone d'affichage.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // L'URL suit la personne au centre : on peut partager ou revenir.
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}?de=${focus}&gen=${gen}`);
  }, [focus, gen]);

  const refocus = useCallback(
    (id: number) => {
      if (!byId.has(id)) return;
      setFocus(id);
      setCam(null);
      setInstant(false);
    },
    [byId],
  );

  // Molette : zoom autour du curseur ; défilement à deux doigts : déplacement.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const trackpadPan = !e.ctrlKey && (Math.abs(e.deltaX) > 0 || (e.deltaMode === 0 && Math.abs(e.deltaY) < 40));
      setInstant(true);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => setInstant(false), 160);
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Mise à jour fonctionnelle : les crans rapides s'additionnent sans à-coups.
      setCam((prev) => {
        const current = prev ?? effectiveRef.current;
        if (trackpadPan)
          return {
            ...current,
            x: current.x - e.deltaX,
            y: current.y - e.deltaY,
          };
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const k = Math.min(1.8, Math.max(0.2, current.k * factor));
        return {
          k,
          x: mx - ((mx - current.x) * k) / current.k,
          y: my - ((my - current.y) * k) / current.k,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Clavier : ↑ parent, ↓ enfant, ← → frères et sœurs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }
      const row = [...layout.siblings, focus].sort(byBirth(byId));
      const i = row.indexOf(focus);
      let next: number | null = null;
      if (e.key === "ArrowUp") next = layout.father ?? layout.mother;
      else if (e.key === "ArrowDown") next = layout.children[0] ?? null;
      else if (e.key === "ArrowLeft") next = row[i - 1] ?? null;
      else if (e.key === "ArrowRight") next = row[i + 1] ?? null;
      else if (e.key === "f" || e.key === "0") {
        setCam(autoCam("fit"));
        return;
      } else return;
      e.preventDefault();
      if (next) refocus(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, focus, byId, refocus, autoCam]);

  /* --------------------------------------------------- glisser / pincer */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    suppressClick.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = viewport.current!.getBoundingClientRect();
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cam: view,
        cx: (a.x + b.x) / 2 - rect.left,
        cy: (a.y + b.y) / 2 - rect.top,
      };
      drag.current = null;
      return;
    }
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      cam: view,
      moved: false,
      id: e.pointerId,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const k = Math.min(1.8, Math.max(0.2, (p.cam.k * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
      setInstant(true);
      setCam({
        k,
        x: p.cx - ((p.cx - p.cam.x) * k) / p.cam.k,
        y: p.cy - ((p.cy - p.cam.y) * k) / p.cam.k,
      });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      suppressClick.current = true;
      viewport.current?.setPointerCapture(e.pointerId);
      setInstant(true);
    }
    if (d.moved) setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
    if (pointers.current.size === 0) setInstant(false);
  };

  const zoomBy = (factor: number) => {
    if (!size) return;
    const k = Math.min(1.8, Math.max(0.2, view.k * factor));
    const cx = size.w / 2;
    const cy = size.h / 2;
    setInstant(false);
    setCam({
      k,
      x: cx - ((cx - view.x) * k) / view.k,
      y: cy - ((cy - view.y) * k) / view.k,
    });
  };

  /* ------------------------------------------------------------ rendu */

  const pickable: PickerPerson[] = useMemo(
    () =>
      people.map((p) => ({
        id: p.id,
        name: `${p.given} ${p.surname}`.trim(),
        birthYear: p.birthYear,
        deathYear: p.deathYear,
        sosa: p.sosa,
      })),
    [people],
  );
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
  const current = byId.get(focus);

  return (
    <div className="relative flex h-full min-h-0">
      {/* Zone de l'arbre */}
      <div
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        className={`relative min-w-0 flex-1 touch-none select-none overflow-hidden bg-canvas ${
          instant ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        {size && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${view.k})`,
              transition: instant ? "none" : `transform 600ms ${ease}`,
            }}
          >
            {/* Liens */}
            <svg
              key={`edges-${focus}-${gen}-${down}-${withSiblings}`}
              className="absolute left-0 top-0 overflow-visible"
              width="1"
              height="1"
              aria-hidden
            >
              {layout.edges.map((e) => (
                <path
                  key={e.key}
                  d={e.d}
                  className="animate-tree-lines"
                  style={{
                    animationDelay: `${160 + rippleDelay(...edgeOrigin(e.d))}ms`,
                  }}
                  fill="none"
                  stroke={LINE}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={e.dashed ? "2 5" : undefined}
                />
              ))}
              {layout.marks.map((m) => (
                <g
                  key={m.key}
                  className="animate-tree-lines"
                  style={{ animationDelay: `${160 + rippleDelay(m.x, m.y)}ms` }}
                >
                  <circle cx={m.x} cy={m.y} r={7} fill="var(--surface)" stroke={LINE} strokeWidth={1.5} />
                  <circle cx={m.x - 2} cy={m.y} r={2.4} fill="none" stroke="var(--fg-subtle)" strokeWidth={1.2} />
                  <circle cx={m.x + 2} cy={m.y} r={2.4} fill="none" stroke="var(--fg-subtle)" strokeWidth={1.2} />
                </g>
              ))}
            </svg>

            {/* Cartes */}
            {layout.nodes.map((n) => {
              // Nouvelles cartes : apparition en vague ; cartes déjà là : déplacement légèrement échelonné.
              const delay = rippleDelay(n.x, n.y);
              const move = `${Math.round(delay * 0.35)}ms`;
              return (
                <div
                  key={n.key}
                  className="absolute left-0 top-0 animate-tree-in"
                  style={{
                    width: n.w,
                    height: n.h,
                    transform: `translate(${n.x - n.w / 2}px, ${n.y - n.h / 2}px)`,
                    transition: `transform 600ms ${ease} ${move}, width 600ms ${ease} ${move}, height 600ms ${ease} ${move}`,
                    animationDelay: `${delay}ms`,
                    zIndex: n.kind === "person" && n.id === focus ? 2 : 1,
                  }}
                >
                  {n.kind === "person" ? (
                    <PersonNode
                      slug={slug}
                      person={byId.get(n.id)!}
                      tier={tierOf(n.level)}
                      focused={n.id === focus}
                      isRoot={n.id === rootId}
                      onFocus={() => refocus(n.id)}
                    />
                  ) : (
                    <Link
                      href={`/p/${slug}/personnes/${n.childId}#famille`}
                      title="Ouvrir la fiche de l’enfant pour rattacher ce parent"
                      className={`flex h-full w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong bg-surface/60 text-fg-subtle transition-colors hover:border-fg/40 hover:bg-surface hover:text-fg ${
                        tierOf(n.level) >= 2 ? "text-2xs" : "text-xs"
                      }`}
                    >
                      <IconPlus size={tierOf(n.level) >= 2 ? 10 : 12} />
                      {ROLE_LABEL[n.role]}
                      {tierOf(n.level) < 2 ? " à trouver" : " ?"}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Intitulés des générations, épinglés au bord gauche */}
        {size &&
          layout.levels
            .filter((l) => l !== 0)
            .map((l) => (
              <span
                key={`lv${l}`}
                className="pointer-events-none absolute left-3 rounded-md border border-border bg-surface/95 px-1.5 py-0.5 text-2xs font-medium text-fg-muted shadow-xs"
                style={{
                  // Dans l'espace libre au-dessus de la rangée : l'étiquette ne masque aucune carte.
                  top: view.y + (rowY(l) - sizeOf(l).h / 2) * view.k - 21,
                  transition: instant ? "none" : `top 600ms ${ease}`,
                }}
              >
                {LEVEL_LABEL[String(l)] ?? `${-l + 1}e génération`}
              </span>
            ))}

        {/* Infos et commandes */}

        <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl lg:left-3 lg:right-auto border border-border bg-surface/95 p-1 shadow-card backdrop-blur">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.2)}
            className={buttonClass("quiet", "", "icon-sm")}
            title="Dézoomer"
            aria-label="Dézoomer"
          >
            <IconMinus size={14} />
          </button>
          <span className="num w-11 text-center text-2xs text-fg-muted">{Math.round(view.k * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomBy(1.2)}
            className={buttonClass("quiet", "", "icon-sm")}
            title="Zoomer"
            aria-label="Zoomer"
          >
            <IconPlus size={14} />
          </button>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setInstant(false);
              setCam(autoCam("fit"));
            }}
            className={buttonClass("quiet", "", "icon-sm")}
            title="Ajuster à l’écran (F)"
            aria-label="Ajuster à l’écran"
          >
            <IconMaximize size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setInstant(false);
              setCam(size ? { k: 1, x: size.w / 2, y: size.h / 2 } : null);
            }}
            className={buttonClass("quiet", "", "icon-sm")}
            title="Centrer sur la personne"
            aria-label="Centrer sur la personne"
          >
            <IconTarget size={14} />
          </button>
        </div>

        {!panelShown && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className={buttonClass("secondary", "absolute right-3 top-3 shadow-card max-md:bottom-3 max-md:left-3 max-md:right-auto max-md:top-auto max-md:h-10")}
            title="Afficher les options de l’arbre"
          >
            <IconPanelRight size={14} />
            Options
          </button>
        )}
      </div>

      {/* Panneau latéral : personne au centre et réglages d'affichage */}
      {panelShown && narrow && (
        <div className="absolute inset-0 z-10 animate-fade-in bg-[var(--overlay)]" onClick={() => setPanelOpen(false)} aria-hidden />
      )}
      {panelShown && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:max-h-[80%] max-md:w-full max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-pop max-md:sheet-enter">
          <div className="flex justify-center pt-2.5 md:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2">
            <h1 className="text-sm font-semibold">Arbre</h1>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className={buttonClass("quiet", "ml-auto", "icon-sm")}
              title="Masquer le panneau"
              aria-label="Masquer le panneau"
            >
              <IconPanelRight size={15} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            <PanelSection title="Personne au centre">
              <PersonSelect
                name="focus"
                people={pickable}
                value={focus}
                allowCreate={false}
                placeholder="Centrer l’arbre sur…"
                onChange={(id) => {
                  if (id) refocus(id);
                }}
              />
              {current && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/50 p-3">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={current.status} className="size-1.5" />
                    <span className="truncate text-sm font-medium">
                      {`${current.given} ${current.surname}`.trim() || "Sans nom"}
                    </span>
                  </div>
                  <div className="num flex items-center justify-between text-2xs text-fg-subtle">
                    <span>
                      {yearsOf(current, false)}
                      {focus === rootId ? " · G1" : current.sosa ? ` · Sosa ${current.sosa}` : ""}
                    </span>
                    <span>
                      {current.score}/{current.total}
                    </span>
                  </div>
                  <SlotStrip score={current.score} total={current.total} missing={[]} />
                </div>
              )}
              <div className="flex gap-2">
                <Link href={`/p/${slug}/personnes/${focus}`} className={buttonClass("primary", "flex-1 justify-center")}>
                  Ouvrir la fiche
                  <IconArrowUpRight size={13} />
                </Link>
                {rootId && rootId !== focus && byId.has(rootId) && (
                  <button
                    type="button"
                    onClick={() => refocus(rootId)}
                    className={buttonClass("secondary")}
                    title="Revenir à la racine Sosa"
                  >
                    <IconTarget size={14} />
                    G1
                  </button>
                )}
              </div>
            </PanelSection>

            <PanelSection
              title="Ascendants"
              aside={
                <span className="num">
                  <span className="text-fg">{layout.ancestorsShown}</span> trouvés sur {layout.ancestorsPossible}
                </span>
              }
            >
              <Segmented
                label="Générations d’ascendants"
                value={gen}
                options={[2, 3, 4, 5, 6].map((g) => [g, `${g - 1}`] as const)}
                onChange={(g) => {
                  setGen(g);
                  setCam(null);
                  setInstant(false);
                }}
              />
              <p className="text-2xs text-fg-subtle">
                {gen - 1} génération{gen > 2 ? "s" : ""} au-dessus de la personne.
              </p>
            </PanelSection>

            <PanelSection title="Descendance">
              <Segmented
                label="Descendance"
                value={down}
                options={[
                  [0, "Aucune"],
                  [1, "Enfants"],
                  [2, "Petits-enfants"],
                ]}
                onChange={(v) => {
                  setDown(v);
                  setCam(null);
                  setInstant(false);
                }}
              />
            </PanelSection>

            <label className="flex items-center justify-between gap-3 text-sm">
              Afficher la fratrie
              <Toggle
                checked={withSiblings}
                onChange={(v) => {
                  setWithSiblings(v);
                  setCam(null);
                }}
                label="Afficher la fratrie"
              />
            </label>
          </div>

          <div className="flex shrink-0 flex-col gap-1.5 border-t border-border px-4 py-3 text-2xs text-fg-subtle">
            <span className="flex items-center gap-1 [@media(pointer:coarse)]:hidden">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              <span className="ml-1">parents, enfants, fratrie</span>
            </span>
            <span className="flex items-center gap-1 [@media(pointer:coarse)]:hidden">
              <Kbd>F</Kbd>
              <span className="ml-1">tout l’arbre à l’écran</span>
            </span>
            <span className="[@media(pointer:coarse)]:hidden">Glisser pour se déplacer, molette pour zoomer.</span>
            <span className="hidden [@media(pointer:coarse)]:inline">
              Touchez une personne pour la centrer. Glissez pour vous déplacer, pincez pour zoomer.
            </span>
          </div>
        </aside>
      )}
    </div>
  );
}

function PanelSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{title}</h2>
        {aside && <span className="text-2xs text-fg-subtle">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="grid h-8 rounded-lg border border-border bg-surface-2/70 p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex h-full items-center justify-center truncate rounded-md px-2 text-xs transition-colors ${
            value === v ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted hover:text-fg"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
