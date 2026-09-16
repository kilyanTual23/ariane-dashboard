import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/app/actions";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { PlaceField } from "@/components/PlaceField";
import { buttonClass, Card } from "@/components/ui";
import {
  getProfileBySlug,
  listPersons,
  listPlaces,
  listTasks,
} from "@/lib/queries";
import { computeLeads } from "@/lib/stats";
import { ACT_KINDS, PRIORITIES, type TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const PRIORITY_TONE: Record<string, string> = {
  Haute: "text-danger",
  Normale: "text-fg-muted",
  Basse: "text-fg-subtle",
};

export default async function TasksPage({
  params,
}: PageProps<"/p/[slug]/taches">) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = listPersons(profile.id);
  const tasks = listTasks(profile.id);
  const places = listPlaces(profile.id);
  const leads = computeLeads(persons, 12);

  const pickable: PickerPerson[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    birthYear: p.birth_year,
    deathYear: p.death_year,
  }));

  const groups: { status: TaskStatus; label: string }[] = [
    { status: "En cours", label: "En cours" },
    { status: "À faire", label: "À faire" },
    { status: "Fait", label: "Fait" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Liste de travail</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Ce qu’il reste à chercher, registre par registre.
        </p>
      </header>

      <Card title="Nouvelle tâche">
        <form
          action={createTaskAction}
          className="grid gap-2 lg:grid-cols-[2fr_1.4fr_auto_auto_auto]"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="profileId" value={profile.id} />
          <input
            className="field"
            name="title"
            placeholder="Ex. Trouver l’acte de décès de…"
            required
          />
          <PersonSelect
            name="person_id"
            people={pickable}
            placeholder="Personne concernée…"
          />
          <select
            className="field w-auto"
            name="kind"
            defaultValue="Acte de naissance"
          >
            {ACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="field w-auto"
            name="priority"
            defaultValue="Normale"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("primary")}>
            Ajouter
          </button>
          <PlaceField
            name="archive"
            places={places}
            placeholder="Dépôt / commune / registre à consulter"
            className="field lg:col-span-3"
          />
          <input
            className="field lg:col-span-2"
            name="url"
            placeholder="Lien vers le registre (facultatif)"
          />
        </form>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {tasks.length === 0 && (
            <Card>
              <p className="py-2 text-sm text-fg-muted">
                Ta liste est vide. Ajoute une piste depuis la colonne de droite,
                ou saisis une tâche ci-dessus.
              </p>
            </Card>
          )}

          {groups.map((group) => {
            const items = tasks.filter((t) => t.status === group.status);
            // Une colonne vide n'a rien à dire : on ne l'affiche pas.
            if (items.length === 0) return null;
            return (
              <Card
                key={group.status}
                title={
                  <span className="flex items-center gap-2">
                    {group.label}
                    <span className="text-xs font-normal tabular-nums text-fg-subtle">
                      {items.length}
                    </span>
                  </span>
                }
              >
                <ul className="divide-y divide-border">
                  {items.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm ${task.status === "Fait" ? "text-fg-subtle line-through" : ""}`}
                          >
                            {task.title}
                          </span>
                          <span
                            className={`text-[11px] ${PRIORITY_TONE[task.priority]}`}
                          >
                            {task.priority !== "Normale" ? task.priority : ""}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                          {task.personName && task.person_id && (
                            <Link
                              href={`/p/${slug}/personnes/${task.person_id}`}
                              className="hover:text-fg"
                            >
                              {task.personName}
                            </Link>
                          )}
                          {task.kind && <span>{task.kind}</span>}
                          {task.archive && <span>{task.archive}</span>}
                          {task.url && (
                            <a
                              href={task.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-fg underline underline-offset-4"
                            >
                              registre ↗
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {task.status !== "En cours" &&
                          task.status !== "Fait" && (
                            <StatusButton
                              slug={slug}
                              taskId={task.id}
                              status="En cours"
                              label="Démarrer"
                            />
                          )}
                        {task.status !== "Fait" && (
                          <StatusButton
                            slug={slug}
                            taskId={task.id}
                            status="Fait"
                            label="Terminer"
                          />
                        )}
                        {task.status === "Fait" && (
                          <StatusButton
                            slug={slug}
                            taskId={task.id}
                            status="À faire"
                            label="Rouvrir"
                          />
                        )}
                        <form action={deleteTaskAction}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <button
                            type="submit"
                            className="px-1 text-xs text-fg-subtle hover:text-danger"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        <Card title="Pistes suggérées">
          <p className="mb-3 text-xs text-fg-muted">
            Calculé depuis les fiches : ancêtres directs d’abord, puis ceux dont
            on connaît déjà la commune et la période.
          </p>
          <ul className="divide-y divide-border">
            {leads.map((lead) => (
              <li key={lead.person.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/p/${slug}/personnes/${lead.person.id}`}
                      className="text-sm font-medium hover:text-fg"
                    >
                      {lead.person.displayName}
                    </Link>
                    <div className="text-[11px] text-fg-subtle">{lead.why}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {lead.missing.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="rounded bg-surface-3 px-1.5 py-px text-[11px] text-fg-muted"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <form action={createTaskAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input
                      type="hidden"
                      name="person_id"
                      value={lead.person.id}
                    />
                    <input
                      type="hidden"
                      name="title"
                      value={`${lead.missing[0]} — ${lead.person.displayName}`}
                    />
                    <input
                      type="hidden"
                      name="kind"
                      value={
                        lead.missing[0]?.startsWith("Acte")
                          ? lead.missing[0]
                          : "Autre"
                      }
                    />
                    <input
                      type="hidden"
                      name="archive"
                      value={
                        lead.person.birth_place ?? lead.person.death_place ?? ""
                      }
                    />
                    <input
                      type="hidden"
                      name="priority"
                      value={
                        lead.person.kinship === "SOSA" ? "Haute" : "Normale"
                      }
                    />
                    <button
                      type="submit"
                      className={buttonClass("ghost", "px-2 py-1 text-xs")}
                    >
                      Ajouter
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
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
      <button
        type="submit"
        className={buttonClass("ghost", "px-2 py-1 text-xs")}
      >
        {label}
      </button>
    </form>
  );
}
