"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import { toFormData } from "@/components/Dialog";
import { IconCheck, IconFlag, IconPlus, IconTrash } from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { Avatar, buttonClass } from "@/components/ui";
import { displayTaskTitle } from "@/lib/names";
import type { TaskWithPerson } from "@/lib/queries";

/*
 * Rappels : une tâche rattachée à une fiche. Notée sur la fiche, elle remonte
 * sur l'accueil tant qu'elle n'est pas cochée (et figure aussi dans les Tâches).
 */

/** Liste optimiste : cocher ou supprimer masque aussitôt le rappel. */
function useReminders(slug: string, tasks: TaskWithPerson[]) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [lastTasks, setLastTasks] = useState(tasks);

  if (tasks !== lastTasks) {
    setLastTasks(tasks);
    setHidden(new Set());
  }

  const hide = (id: number) => setHidden((h) => new Set(h).add(id));
  const unhide = (id: number) =>
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });

  const complete = (task: TaskWithPerson) => {
    hide(task.id);
    startTransition(async () => {
      try {
        await updateTaskAction(toFormData({ slug, taskId: task.id, status: "Fait" }));
        toast({
          title: "Rappel traité",
          description: task.title,
          action: {
            label: "Annuler",
            onClick: () =>
              startTransition(async () => {
                await updateTaskAction(toFormData({ slug, taskId: task.id, status: "À faire" }));
              }),
          },
        });
      } catch (err) {
        unhide(task.id);
        toast.error("Mise à jour impossible", errorMessage(err));
      }
    });
  };

  const remove = (task: TaskWithPerson) => {
    hide(task.id);
    startTransition(async () => {
      try {
        await deleteTaskAction(toFormData({ slug, taskId: task.id }));
        toast.success("Rappel supprimé", task.title);
      } catch (err) {
        unhide(task.id);
        toast.error("Suppression impossible", errorMessage(err));
      }
    });
  };

  return { visible: tasks.filter((t) => !hidden.has(t.id)), complete, remove };
}

function DoneButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={false}
      aria-label="Marquer comme fait"
      title="Marquer comme fait"
      onClick={onClick}
      className="group/done mt-px flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-warn-dot/60 bg-surface transition-colors hover:border-ok-dot hover:bg-ok-dot"
    >
      <IconCheck size={11} strokeWidth={3} className="text-white opacity-0 transition-opacity group-hover/done:opacity-100" />
    </button>
  );
}

/** Sur la fiche : les rappels ouverts et un champ pour en ajouter. */
export function PersonReminders({
  slug,
  profileId,
  personId,
  tasks,
}: {
  slug: string;
  profileId: number;
  personId: number;
  tasks: TaskWithPerson[];
}) {
  const toast = useToast();
  const { visible, complete, remove } = useReminders(slug, tasks);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    startTransition(async () => {
      try {
        await createTaskAction(toFormData({ slug, profileId, person_id: personId, title }));
        setDraft("");
        inputRef.current?.focus();
        toast.success("Rappel ajouté", "Il apparaîtra sur l’accueil tant qu’il n’est pas fait.");
      } catch (err) {
        toast.error("Ajout impossible", errorMessage(err));
      }
    });
  };

  const field = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={inputRef}
        autoFocus={adding}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft("");
            setAdding(false);
          }
        }}
        onBlur={() => {
          if (!draft.trim() && !visible.length) setAdding(false);
        }}
        disabled={pending}
        placeholder="Ex. vérifier la date de mariage dans le registre de Billé…"
        aria-label="Nouveau rappel sur cette fiche"
        className="field h-8 flex-1 bg-surface"
      />
      <button type="submit" disabled={pending || !draft.trim()} className={buttonClass("secondary", "", "sm")}>
        Ajouter
      </button>
    </form>
  );

  // Aucun rappel : un simple lien discret, pour ne pas alourdir la fiche.
  if (!visible.length && !adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-fg-subtle transition-colors hover:text-fg"
      >
        <IconFlag size={12} />
        Ajouter un rappel sur cette fiche
      </button>
    );
  }

  return (
    <section aria-label="À faire sur cette fiche" className="mt-6 rounded-lg bg-warn-soft px-4 py-3">
      <p className="flex items-center gap-2 text-ui font-semibold text-warn">
        <IconFlag size={14} />
        À faire sur cette fiche
        {visible.length > 1 && <span className="num text-xs font-medium">{visible.length}</span>}
      </p>
      {visible.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {visible.map((task) => (
            <li key={task.id} className="group flex items-start gap-2.5 text-ui">
              <DoneButton onClick={() => complete(task)} />
              <span className="min-w-0 flex-1 text-fg">{displayTaskTitle(task.title, task.personName)}</span>
              <button
                type="button"
                onClick={() => remove(task)}
                aria-label="Supprimer le rappel"
                title="Supprimer le rappel"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-surface hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <IconTrash size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5">
        {adding || !visible.length ? (
          field
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <IconPlus size={12} />
            Ajouter un rappel
          </button>
        )}
      </div>
    </section>
  );
}

const SHOWN = 6;

/** Sur l'accueil : les rappels ouverts, fiche par fiche. */
export function ReminderBoard({ slug, tasks }: { slug: string; tasks: TaskWithPerson[] }) {
  const { visible, complete } = useReminders(slug, tasks);
  if (!visible.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-warn-dot/30 bg-surface shadow-xs">
      <header className="flex items-center gap-2 border-b border-border bg-warn-soft/60 px-5 py-3">
        <IconFlag size={14} className="text-warn" />
        <h2 className="text-sm font-semibold">À faire sur vos fiches</h2>
        <span className="num text-xs text-fg-subtle">{visible.length}</span>
        {visible.length > SHOWN && (
          <Link href={`/p/${slug}/taches`} className="ml-auto text-xs text-fg-muted hover:text-fg hover:underline">
            Voir tout
          </Link>
        )}
      </header>
      <ul className="divide-y divide-border">
        {visible.slice(0, SHOWN).map((task) => (
          <li key={task.id} className="flex items-center gap-3 px-5 py-2.5">
            <DoneButton onClick={() => complete(task)} />
            <Link
              href={`/p/${slug}/personnes/${task.person_id}`}
              className="group flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar seed={task.person_id} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui text-fg">{displayTaskTitle(task.title, task.personName)}</span>
                <span className="block truncate text-xs text-fg-subtle group-hover:text-fg-muted group-hover:underline">
                  {task.personName}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
