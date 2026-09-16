"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteTaskAction, updateTaskAction } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import type { TaskWithPerson } from "@/lib/queries";
import type { TaskStatus } from "@/lib/types";

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  Haute: {
    label: "Haute",
    className: "border-danger/30 bg-danger/10 text-danger",
  },
  Normale: {
    label: "Normale",
    className: "border-border bg-surface-2 text-fg-muted",
  },
  Basse: {
    label: "Basse",
    className: "border-border/60 bg-surface text-fg-subtle",
  },
};

export function TaskList({ slug, tasks }: { slug: string; tasks: TaskWithPerson[] }) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [query, setQuery] = useState("");

  const enCoursCount = useMemo(() => tasks.filter((t) => t.status === "En cours").length, [tasks]);
  const aFaireCount = useMemo(() => tasks.filter((t) => t.status === "À faire").length, [tasks]);
  const faitCount = useMemo(() => tasks.filter((t) => t.status === "Fait").length, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.personName && t.personName.toLowerCase().includes(q)) ||
        (t.kind && t.kind.toLowerCase().includes(q)) ||
        (t.archive && t.archive.toLowerCase().includes(q))
      );
    });
  }, [tasks, filterStatus, query]);

  return (
    <div className="flex flex-col gap-3">
      {/* Barre de contrôle : filtres rapides et recherche */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              filterStatus === "all"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            Toutes ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("En cours")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
              filterStatus === "En cours"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span className="size-1.5 rounded-full bg-accent" />
            En cours ({enCoursCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("À faire")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
              filterStatus === "À faire"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span className="size-1.5 rounded-full bg-fg-subtle" />
            À faire ({aFaireCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("Fait")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
              filterStatus === "Fait"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span className="size-1.5 rounded-full bg-ok" />
            Terminées ({faitCount})
          </button>
        </div>

        <div className="relative max-w-56 flex-1">
          <input
            className="field w-full py-1 pl-7 pr-6 text-xs"
            placeholder="Filtrer les tâches…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle">
            🔍
          </span>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded text-xs text-fg-subtle hover:text-fg"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Liste des tâches */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          {query || filterStatus !== "all" ? (
            <div>
              <p>Aucune tâche ne correspond à cette sélection.</p>
              <button
                type="button"
                onClick={() => {
                  setFilterStatus("all");
                  setQuery("");
                }}
                className="mt-2 text-xs text-fg underline underline-offset-4"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <p>Ta liste de tâches est vide. Ajoute une piste depuis la colonne de droite !</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface p-2 shadow-soft">
          {filteredTasks.map((task) => {
            const priorityBadge = PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES.Normale;
            const isDone = task.status === "Fait";

            return (
              <li
                key={task.id}
                className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 transition-colors hover:bg-surface-2/50"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {/* Action rapide coche */}
                  <form action={updateTaskAction} className="mt-0.5 shrink-0">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="status" value={isDone ? "À faire" : "Fait"} />
                    <button
                      type="submit"
                      className={`flex size-5 items-center justify-center rounded-md border transition-all ${
                        isDone
                          ? "border-ok bg-ok text-accent-fg"
                          : "border-border bg-surface hover:border-border-strong"
                      }`}
                      title={isDone ? "Marquer comme à faire" : "Marquer comme fait"}
                    >
                      {isDone && <span className="text-xs font-bold leading-none">✓</span>}
                    </button>
                  </form>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          isDone ? "text-fg-subtle line-through" : "text-fg"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${priorityBadge.className}`}
                      >
                        {priorityBadge.label}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                      {task.personName && task.person_id && (
                        <Link
                          href={`/p/${slug}/personnes/${task.person_id}`}
                          className="font-medium text-fg-muted hover:text-fg hover:underline"
                        >
                          👤 {task.personName}
                        </Link>
                      )}
                      {task.kind && <span>{task.kind}</span>}
                      {task.archive && <span>🏛 {task.archive}</span>}
                      {task.url && (
                        <a
                          href={task.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-fg underline underline-offset-4 hover:decoration-fg"
                        >
                          registre ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Boutons d'action statut & suppression */}
                <div className="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
                  {task.status !== "En cours" && !isDone && (
                    <StatusButton slug={slug} taskId={task.id} status="En cours" label="▶ Démarrer" />
                  )}
                  {task.status === "En cours" && (
                    <StatusButton slug={slug} taskId={task.id} status="Fait" label="✓ Terminer" />
                  )}
                  {isDone && (
                    <StatusButton slug={slug} taskId={task.id} status="À faire" label="↺ Rouvrir" />
                  )}
                  <form action={deleteTaskAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      className="rounded p-1 text-xs text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                      title="Supprimer la tâche"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusButton({
  slug,
  taskId,
  status,
  label,
}: {
  slug: string;
  taskId: number;
  status: TaskStatus;
  label: string;
}) {
  return (
    <form action={updateTaskAction}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={buttonClass("ghost", "px-2 py-1 text-xs")}>
        {label}
      </button>
    </form>
  );
}

