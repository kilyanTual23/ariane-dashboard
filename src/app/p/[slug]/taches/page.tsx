import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createTaskAction } from "@/app/actions";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { PlaceField } from "@/components/PlaceField";
import { TaskList } from "@/components/TaskList";
import { buttonClass, Card } from "@/components/ui";
import {
  getProfileBySlug,
  listPersons,
  listPlaces,
  listTasks,
} from "@/lib/queries";
import { computeLeads } from "@/lib/stats";
import { ACT_KINDS, PRIORITIES } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tâches & Pistes",
};

export default async function TasksPage({
  params,
}: PageProps<"/p/[slug]/taches">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [persons, tasks, places] = await Promise.all([
    listPersons(profile.id),
    listTasks(profile.id),
    listPlaces(profile.id),
  ]);
  const leads = computeLeads(persons, 12);

  const pickable: PickerPerson[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    birthYear: p.birth_year,
    deathYear: p.death_year,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Liste de travail</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Ce qu’il reste à chercher, registre par registre.
          </p>
        </div>
      </header>

      {/* Formulaire de création rapide */}
      <Card title="Ajouter une tâche">
        <form
          action={createTaskAction}
          className="grid gap-2.5 lg:grid-cols-[2fr_1.4fr_auto_auto_auto]"
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
            + Ajouter
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

      {/* Grille principale : Tâches à gauche, Pistes suggérées à droite */}
      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="flex flex-col gap-4">
          <TaskList slug={slug} tasks={tasks} />
        </div>

        <div className="flex flex-col gap-4">
          <Card
            title="Pistes suggérées"
            action={
              <span className="text-xs text-fg-subtle">
                {leads.length} pistes
              </span>
            }
          >
            <p className="mb-3 text-xs text-fg-muted">
              Détecté depuis les fiches incomplètes : ancêtres directs d’abord, puis selon les lieux déjà connus.
            </p>
            {leads.length === 0 ? (
              <p className="py-6 text-center text-xs text-fg-subtle">
                Aucune piste suggérée pour le moment.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {leads.map((lead) => (
                  <li key={lead.person.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/p/${slug}/personnes/${lead.person.id}`}
                          className="text-sm font-medium text-fg hover:underline"
                        >
                          {lead.person.displayName}
                        </Link>
                        <div className="mt-0.5 text-xs text-fg-subtle">{lead.why}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {lead.missing.slice(0, 3).map((m) => (
                            <span
                              key={m}
                              className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      <form action={createTaskAction} className="shrink-0">
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
                          value={`${lead.missing[0]} : ${lead.person.displayName}`}
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
                          className={buttonClass("ghost", "px-2.5 py-1 text-xs")}
                          title="Créer une tâche pour cette piste"
                        >
                          + Ajouter
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
