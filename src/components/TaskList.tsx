"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import { Dialog, toFormData } from "@/components/Dialog";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconFlag,
  IconListChecks,
  IconMapPin,
  IconPlay,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUndo,
  IconUser,
  IconX,
  Spinner,
} from "@/components/icons";
import { MobileFab } from "@/components/MobileChrome";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { PlaceField } from "@/components/PlaceField";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass, EmptyState } from "@/components/ui";
import type { TaskWithPerson } from "@/lib/queries";
import { displayTaskTitle } from "@/lib/names";
import { normalize } from "@/lib/search";
import { ACT_KINDS, PRIORITIES, type Priority, type TaskStatus } from "@/lib/types";

const PRIORITY_ORDER: Record<string, number> = { Haute: 0, Normale: 1, Basse: 2 };

/* --------------------------------------------------------------- saisie */

export function TaskComposer({
  slug,
  profileId,
  people,
  places,
  variant = "bar",
  onCreated,
}: {
  slug: string;
  profileId: number;
  people: PickerPerson[];
  places: string[];
  /** « sheet » : champs empilés, dans le tiroir mobile. */
  variant?: "bar" | "sheet";
  onCreated?: () => void;
}) {
  const sheet = variant === "sheet";
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [more, setMore] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <form
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("slug", slug);
        fd.set("profileId", String(profileId));
        if (!String(fd.get("title") ?? "").trim()) return;
        startTransition(async () => {
          try {
            await createTaskAction(fd);
            toast.success("Tâche ajoutée");
            setFormKey((k) => k + 1);
            if (onCreated) onCreated();
            else requestAnimationFrame(() => titleRef.current?.focus());
          } catch (err) {
            toast.error("Tâche non ajoutée", errorMessage(err));
          }
        });
      }}
      className={sheet ? "" : "rounded-xl border border-border bg-surface p-3 shadow-xs"}
    >
      <div className={`flex flex-col gap-2 ${sheet ? "" : "lg:flex-row lg:items-center"}`}>
        <div className="relative min-w-0 flex-1">
          <IconPlus size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={titleRef}
            name="title"
            required
            className={`field pl-8 ${sheet ? "h-11" : "h-9 border-transparent text-sm shadow-none hover:border-border focus:border-border"}`}
            placeholder={sheet ? "Ex. Trouver l’acte de décès" : "Nouvelle tâche…"}
            aria-label="Intitulé de la tâche"
          />
        </div>
        <div className={sheet ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-2"}>
          <div className={sheet ? "col-span-2" : "w-full sm:w-56"}>
            <PersonSelect name="person_id" people={people} placeholder="Personne concernée" allowCreate={false} inlineList={sheet} />
          </div>
          <select name="kind" defaultValue="" className={`field ${sheet ? "" : "w-auto"}`} aria-label="Type de recherche">
            <option value="">Type…</option>
            {ACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue="Normale" className={`field ${sheet ? "" : "w-auto"}`} aria-label="Priorité">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                Priorité {p.toLowerCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className={buttonClass("quiet", sheet ? "col-span-2 justify-start" : "", "md")}
            aria-expanded={more}
          >
            {more ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            Détails
          </button>
          <button type="submit" disabled={pending} className={buttonClass("primary", sheet ? "col-span-2 h-11 justify-center" : "min-w-24")}>
            {pending ? <Spinner /> : "Ajouter"}
          </button>
        </div>
      </div>
      {more && (
        <div className="mt-2 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <PlaceField name="archive" places={places} placeholder="Dépôt, commune ou registre à consulter" />
          <input name="url" type="url" className="field" placeholder="Lien vers le registre (facultatif)" />
        </div>
      )}
    </form>
  );
}

/** Mobile : un bouton flottant ouvre la saisie dans un tiroir. */
export function MobileTaskComposer(props: { slug: string; profileId: number; people: PickerPerson[]; places: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MobileFab onClick={() => setOpen(true)} label="Nouvelle tâche" />
      <Dialog open={open} onClose={() => setOpen(false)} title="Nouvelle tâche" scrollable={false}>
        <TaskComposer {...props} variant="sheet" onCreated={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------- liste */

type Filter = "open" | "En cours" | "À faire" | "Fait" | "all";

export function TaskList({ slug, tasks }: { slug: string; tasks: TaskWithPerson[] }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, TaskStatus>>({});
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [lastTasks, setLastTasks] = useState(tasks);
  const [, startTransition] = useTransition();

  // Les données serveur remplacent les modifications optimistes dès qu'elles arrivent.
  if (tasks !== lastTasks) {
    setLastTasks(tasks);
    setOverrides({});
    setHidden(new Set());
  }

  const live = useMemo(
    () =>
      tasks
        .filter((t) => !hidden.has(t.id))
        .map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id] } : t)),
    [tasks, overrides, hidden],
  );

  const counts = {
    open: live.filter((t) => t.status === "À faire" || t.status === "En cours").length,
    "En cours": live.filter((t) => t.status === "En cours").length,
    "À faire": live.filter((t) => t.status === "À faire").length,
    Fait: live.filter((t) => t.status === "Fait").length,
    all: live.length,
  };

  const q = normalize(query);
  const visible = live.filter((t) => {
    if (filter === "open" && !(t.status === "À faire" || t.status === "En cours")) return false;
    if (filter !== "open" && filter !== "all" && t.status !== filter) return false;
    if (!q) return true;
    return normalize([t.title, t.personName, t.kind, t.archive].filter(Boolean).join(" ")).includes(q);
  });

  const sortByPriority = (list: TaskWithPerson[]) =>
    [...list].sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );

  const groups: { key: string; title: string; items: TaskWithPerson[]; collapsible?: boolean }[] = [
    { key: "En cours", title: "En cours", items: sortByPriority(visible.filter((t) => t.status === "En cours")) },
    { key: "À faire", title: "À faire", items: sortByPriority(visible.filter((t) => t.status === "À faire")) },
    {
      key: "Fait",
      title: "Terminées",
      items: visible.filter((t) => t.status === "Fait" || t.status === "Abandonné"),
      collapsible: filter === "all",
    },
  ].filter((g) => g.items.length > 0);

  const setStatus = (task: TaskWithPerson, status: TaskStatus) => {
    setOverrides((o) => ({ ...o, [task.id]: status }));
    startTransition(async () => {
      try {
        await updateTaskAction(toFormData({ slug, taskId: task.id, status }));
        if (status === "Fait") toast.success("Tâche terminée", task.title);
      } catch (err) {
        setOverrides((o) => {
          const next = { ...o };
          delete next[task.id];
          return next;
        });
        toast.error("Mise à jour impossible", errorMessage(err));
      }
    });
  };

  const remove = (task: TaskWithPerson) => {
    setHidden((h) => new Set(h).add(task.id));
    startTransition(async () => {
      try {
        await deleteTaskAction(toFormData({ slug, taskId: task.id }));
        toast({
          title: "Tâche supprimée",
          description: task.title,
          action: {
            label: "Annuler",
            onClick: () =>
              startTransition(async () => {
                await createTaskAction(
                  toFormData({
                    slug,
                    profileId: task.profile_id,
                    title: task.title,
                    person_id: task.person_id,
                    details: task.details,
                    kind: task.kind,
                    archive: task.archive,
                    url: task.url,
                    priority: task.priority,
                    status: task.status,
                  }),
                );
              }),
          },
        });
      } catch (err) {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(task.id);
          return next;
        });
        toast.error("Suppression impossible", errorMessage(err));
      }
    });
  };

  const tabs: [Filter, string][] = [
    ["open", "Ouvertes"],
    ["Fait", "Terminées"],
    ["all", "Toutes"],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-ui transition-colors ${
                filter === key ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {label}
              <span className="num text-2xs text-fg-subtle">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <IconSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            className="field pl-8 pr-7"
            placeholder="Filtrer les tâches…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filtrer les tâches"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer"
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<IconListChecks size={18} />}
          title={query || filter !== "open" ? "Aucune tâche ici" : "Rien en attente"}
          action={
            query || filter !== "open" ? (
              <button
                type="button"
                onClick={() => {
                  setFilter("open");
                  setQuery("");
                }}
                className={buttonClass("secondary")}
              >
                Voir les tâches ouvertes
              </button>
            ) : undefined
          }
        >
          {query || filter !== "open"
            ? "Changez de filtre ou de mot-clé."
            : "Ajoutez une tâche ci-dessus, ou piochez dans les pistes suggérées."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const collapsed = group.collapsible && !showDone;
            return (
              <section key={group.key} className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
                <button
                  type="button"
                  disabled={!group.collapsible}
                  onClick={() => setShowDone((v) => !v)}
                  className="flex w-full items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2 text-left text-xs font-medium text-fg-muted disabled:cursor-default"
                >
                  {group.collapsible && (collapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />)}
                  {group.title}
                  <span className="num text-fg-subtle">{group.items.length}</span>
                </button>
                {!collapsed && (
                  <ul className="divide-y divide-border">
                    {group.items.map((task) => (
                      <TaskRow
                        key={task.id}
                        slug={slug}
                        task={task}
                        onStatus={(s) => setStatus(task, s)}
                        onDelete={() => remove(task)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  slug,
  task,
  onStatus,
  onDelete,
}: {
  slug: string;
  task: TaskWithPerson;
  onStatus: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const done = task.status === "Fait" || task.status === "Abandonné";
  const priority = task.priority as Priority;
  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Rouvrir la tâche" : "Marquer comme faite"}
        onClick={() => onStatus(done ? "À faire" : "Fait")}
        className={`mt-0.5 flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border transition-colors ${
          done ? "border-ok-dot bg-ok-dot text-white" : "border-border-strong hover:border-fg/50 hover:bg-surface-2"
        }`}
      >
        {done && <IconCheck size={11} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-2 text-ui ${done ? "text-fg-subtle line-through" : "font-medium text-fg"}`}>
          {priority === "Haute" && !done && (
            <IconFlag size={13} className="shrink-0 text-danger" aria-label="Priorité haute" />
          )}
          <span className="min-w-0">{displayTaskTitle(task.title, task.personName)}</span>
          {task.status === "En cours" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-soft px-1.5 py-px text-2xs font-medium text-info">
              <span className="size-1.5 animate-pulse rounded-full bg-info-dot" />
              En cours
            </span>
          )}
          {priority === "Basse" && !done && <span className="shrink-0 text-2xs font-normal text-fg-subtle">basse</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
          {task.personName && task.person_id && (
            <Link href={`/p/${slug}/personnes/${task.person_id}`} className="flex items-center gap-1 text-fg-muted hover:text-fg hover:underline">
              <IconUser size={12} />
              {task.personName}
            </Link>
          )}
          {task.kind && !displayTaskTitle(task.title, task.personName).toLowerCase().includes(task.kind.toLowerCase()) && (
            <span>{task.kind}</span>
          )}
          {task.archive && (
            <span className="flex min-w-0 items-center gap-1">
              <IconMapPin size={12} />
              <span className="truncate">{task.archive}</span>
            </span>
          )}
          {task.url && (
            <a href={task.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-fg-muted hover:text-fg">
              <IconExternalLink size={12} />
              Registre
            </a>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        {task.status === "À faire" && (
          <button type="button" onClick={() => onStatus("En cours")} className={buttonClass("secondary", "max-sm:size-8 max-sm:px-0 max-sm:justify-center", "xs")} title="Commencer" aria-label="Commencer">
            <IconPlay size={11} />
            <span className="max-sm:hidden">Commencer</span>
          </button>
        )}
        {task.status === "En cours" && (
          <button type="button" onClick={() => onStatus("À faire")} className={buttonClass("quiet", "max-sm:size-8 max-sm:px-0 max-sm:justify-center", "xs")} title="Remettre à faire" aria-label="Remettre à faire">
            <IconUndo size={11} />
            <span className="max-sm:hidden">Pause</span>
          </button>
        )}
        <button type="button" onClick={onDelete} className={buttonClass("quiet", "hover:text-danger", "icon-sm")} title="Supprimer" aria-label="Supprimer la tâche">
          <IconTrash size={13} />
        </button>
      </div>
    </li>
  );
}
