import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createTaskAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { IconCheck, IconCircleCheck, IconPlus } from "@/components/icons";
import type { PickerPerson } from "@/components/PersonSelect";
import { ResourceLinks } from "@/components/ResourceLinks";
import { MobileTaskComposer, TaskComposer, TaskList } from "@/components/TaskList";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { getProfileBySlug, listPersons, listPlaces, listResources, listTasks } from "@/lib/queries";
import { taskTitleFor } from "@/lib/names";
import { computeLeads } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tâches",
};

export default async function TasksPage({ params }: PageProps<"/p/[slug]/taches">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [persons, tasks, places, resources] = await Promise.all([
    listPersons(profile.id),
    listTasks(profile.id),
    listPlaces(profile.id),
    listResources(profile.id),
  ]);
  const leads = computeLeads(persons, 8);
  const openTasks = tasks.filter((t) => t.status === "À faire" || t.status === "En cours");
  const withOpenTask = new Set(openTasks.map((t) => t.person_id).filter(Boolean));

  const pickable: PickerPerson[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    birthYear: p.birth_year,
    deathYear: p.death_year,
    sosa: p.sosa,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tâches"
        description={
          <>
            Ce qu’il reste à chercher, registre par registre ·{" "}
            <span className="num">{openTasks.length}</span> ouverte{openTasks.length > 1 ? "s" : ""}
          </>
        }
      />

      <div className="max-lg:hidden">
        <TaskComposer slug={slug} profileId={profile.id} people={pickable} places={places} />
      </div>
      <MobileTaskComposer slug={slug} profileId={profile.id} people={pickable} places={places} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskList slug={slug} tasks={tasks} />

        <div className="flex flex-col gap-6">
        <Card
          title="Pistes suggérées"
          description="Tirées des fiches incomplètes : ancêtres directs d’abord, puis lieu et époque déjà connus."
          bodyClassName="!px-0 !pb-2"
        >
          {leads.length === 0 ? (
            <p className="flex items-center gap-2 border-t border-border px-5 pt-4 text-ui text-ok">
              <IconCircleCheck size={15} />
              Toutes les fiches sont complètes.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {leads.map((lead) => {
                const planned = withOpenTask.has(lead.person.id);
                return (
                  <li key={lead.person.id} className="flex items-start gap-3 px-4 py-3">
                    <Avatar seed={lead.person.id} given={lead.person.given_names} surname={lead.person.surname} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/p/${slug}/personnes/${lead.person.id}`}
                        className="flex items-center gap-1.5 text-ui font-medium hover:underline"
                      >
                        <span className="truncate">{lead.person.displayName}</span>
                        {lead.person.sosa && <span className="num text-2xs font-normal text-fg-subtle">#{lead.person.sosa}</span>}
                      </Link>
                      <p className="truncate text-xs text-fg-subtle">{lead.why}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {lead.missing.slice(0, 2).map((m) => (
                          <Badge key={m}>{m}</Badge>
                        ))}
                        {lead.missing.length > 2 && <Badge>+{lead.missing.length - 2}</Badge>}
                      </div>
                    </div>
                    {planned ? (
                      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-2xs text-fg-subtle" title="Une tâche ouverte existe déjà pour cette personne">
                        <IconCheck size={12} />
                        Prévue
                      </span>
                    ) : (
                      <ActionButton
                        action={createTaskAction}
                        fields={{
                          slug,
                          profileId: profile.id,
                          person_id: lead.person.id,
                          title: taskTitleFor(lead.missing[0]),
                          kind: lead.missing[0]?.startsWith("Acte") ? lead.missing[0] : "Autre",
                          archive: lead.person.birth_place ?? lead.person.death_place ?? "",
                          priority: lead.person.kinship === "SOSA" ? "Haute" : "Normale",
                        }}
                        successMessage="Ajouté à vos tâches"
                        size="xs"
                        title="Créer une tâche pour cette piste"
                      >
                        <IconPlus size={12} />
                        Tâche
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Liens utiles" description="Vos sites d’archives et outils de recherche.">
          <ResourceLinks slug={slug} profileId={profile.id} resources={resources} />
        </Card>
        </div>
      </div>
    </div>
  );
}
