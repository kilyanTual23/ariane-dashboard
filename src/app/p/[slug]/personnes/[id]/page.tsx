import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  addChildAction,
  addParentAction,
  createSourceAction,
  createTaskAction,
  deletePersonAction,
  deleteSourceAction,
  deleteUnionAction,
  quickStatusAction,
  removeParentAction,
  saveUnionAction,
  setRootPersonAction,
  toggleLivingAction,
  toggleUnmarriedAction,
} from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActSlot } from "@/components/ActSlot";
import { ConfirmButton } from "@/components/Dialog";
import { Field, FormDialog } from "@/components/FormDialog";
import { GeneanetSearchButton } from "@/components/GeneanetSearchButton";
import {
  IconAlert,
  IconArrowLeft,
  IconBan,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconFlag,
  IconMerge,
  IconPlus,
  IconTarget,
  IconTrash,
  IconTree,
  IconUnlink,
} from "@/components/icons";
import { Inline, InlineSelect } from "@/components/Inline";
import { SlotStrip } from "@/components/PersonCard";
import { PersonMobileBar } from "@/components/PersonMobileBar";
import { PersonPageEffects } from "@/components/PersonPageEffects";
import { PersonReminders } from "@/components/PersonReminders";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { PlaceField } from "@/components/PlaceField";
import { SegmentedAction } from "@/components/SegmentedAction";
import { StatusPicker } from "@/components/StatusPicker";
import { Avatar, Badge, buttonClass, Kbd } from "@/components/ui";
import { localActVersion } from "@/lib/act-downloader";
import { detectPersonAnomalies } from "@/lib/anomalies";
import { COMPLETION_CRITERIA } from "@/lib/completion";
import { taskTitleFor } from "@/lib/names";
import { getProfileBySlug, listPersons, listPlaces, listSources, listTasks } from "@/lib/queries";
import { generationOf } from "@/lib/stats";
import { suggestRelatives } from "@/lib/suggest";
import { summarize } from "@/lib/summary";
import { ACT_KINDS, KINSHIPS, type Person, type PersonRef } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]/personnes/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) return { title: "Fiche introuvable" };
  const persons = await listPersons(profile.id);
  const person = persons.find((p) => p.id === Number(id));
  if (!person) return { title: "Fiche introuvable" };
  const years =
    person.birth_year || person.death_year ? ` (${person.birth_year ?? "?"}–${person.death_year ?? "?"})` : "";
  return { title: `${person.displayName}${years}` };
}

/* ------------------------------------------------------------------ pièces */

/** Une section du document : un titre et un filet, pas de cadre. */
function Section({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-6 border-t border-border pt-5">
      <div className="mb-3 flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action && <div className="flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  );
}

const EVENT_COLS = "md:grid-cols-[8.5rem_minmax(0,0.85fr)_minmax(0,1.3fr)_minmax(0,1fr)]";

/** Une ligne de l'état civil : l'événement, puis date, lieu et acte. */
function EventRow({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={id} className={`grid scroll-mt-6 gap-x-4 gap-y-1 py-2.5 md:items-start ${EVENT_COLS}`}>
      <div className="flex min-w-0 flex-col gap-1 pt-1.5">
        <h3 className="text-ui font-medium">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Une cellule : son intitulé n'apparaît que sur mobile, la colonne le porte ailleurs. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="w-12 shrink-0 pt-2 text-xs text-fg-subtle md:hidden">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Événement sans objet (vivant, célibataire) ou à créer : une seule cellule large. */
function WideCell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 py-1 text-ui text-fg-subtle md:col-span-3">{children}</div>;
}

function years(p: { birth_year: number | null; death_year: number | null }) {
  if (!p.birth_year && !p.death_year) return null;
  return `${p.birth_year ?? "?"} – ${p.death_year ?? "?"}`;
}

/** Un proche : nom cliquable, années, et détachement au survol. */
function Relative({ slug, person, detach }: { slug: string; person: PersonRef; detach?: ReactNode }) {
  return (
    <div className="group -mx-2 flex min-h-9 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-surface-2">
      <Avatar seed={person.id} size="sm" />
      <Link href={`/p/${slug}/personnes/${person.id}`} className="min-w-0 truncate text-ui font-medium hover:underline">
        {person.displayName}
      </Link>
      {years(person) && <span className="num shrink-0 text-xs text-fg-subtle">{years(person)}</span>}
      {detach && (
        <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{detach}</span>
      )}
    </div>
  );
}

/** Une propriété de la colonne de droite : intitulé à gauche, valeur à droite. */
function Property({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3" title={hint}>
      <span className="shrink-0 text-xs text-fg-subtle">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

const PLAIN_SELECT = "h-7 w-auto max-w-40 border-transparent bg-transparent pl-2 text-right shadow-none hover:bg-surface-2";

/* -------------------------------------------------------------------- page */

export default async function PersonPage({ params }: PageProps<"/p/[slug]/personnes/[id]">) {
  const { slug, id } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [persons, places] = await Promise.all([listPersons(profile.id), listPlaces(profile.id)]);
  const person: Person | undefined = persons.find((p) => p.id === Number(id));
  if (!person) notFound();

  const byId = new Map(persons.map((p) => [p.id, p]));
  const anomalies = detectPersonAnomalies(person, byId);
  const [sources, tasks] = await Promise.all([listSources(person.id), listTasks(profile.id)]);
  const reminders = tasks.filter(
    (t) => t.person_id === person.id && (t.status === "À faire" || t.status === "En cours"),
  );

  const pickable: PickerPerson[] = persons
    .filter((p) => p.id !== person.id)
    .map((p) => ({ id: p.id, name: p.displayName, birthYear: p.birth_year, deathYear: p.death_year, sosa: p.sosa }));

  const generation = generationOf(person.sosa);
  const isSosaRoot = profile.root_person_id === person.id;
  const { score, total, missing, filled, ignored } = person.completion;
  const percent = Math.round((score / Math.max(1, total)) * 100);
  const base = `/p/${slug}`;
  const target = (field: string) => ({ kind: "person" as const, personId: person.id, field });
  const ids = { slug, profileId: profile.id, personId: person.id };

  const index = persons.findIndex((p) => p.id === person.id);
  const prev = index > 0 ? persons[index - 1] : null;
  const next = index >= 0 && index < persons.length - 1 ? persons[index + 1] : null;

  const father = person.parents.find((p) => p.sex === "M") ?? null;
  const mother = person.parents.find((p) => p.sex === "F" && p.id !== father?.id) ?? null;
  const otherParents = person.parents.filter((p) => p.id !== father?.id && p.id !== mother?.id);
  // Les fiches plausibles d'abord, dans chaque dialogue de rattachement.
  const suggestions = {
    child: suggestRelatives(person, persons, "child"),
    father: suggestRelatives(person, persons, "father"),
    mother: suggestRelatives(person, persons, "mother"),
    spouse: suggestRelatives(person, persons, "spouse"),
  };

  // Ce qui manque d'abord, cliquable ; le reste replié.
  const anchorOf = (criterion: string) =>
    criterion.includes("naissance")
      ? "#naissance"
      : criterion.includes("mariage")
        ? "#mariage"
        : criterion.includes("décès")
          ? "#deces"
          : criterion === "Parents"
            ? "#famille"
            : "#identite";
  const orderedMissing = COMPLETION_CRITERIA.filter((c) => missing.includes(c));
  const orderedDone = COMPLETION_CRITERIA.filter((c) => filled.includes(c) || ignored.includes(c));

  const dispensed = (ignoredAct: number | boolean, has: unknown) => Boolean(ignoredAct) && !has;

  // Statut resté « Pas commencé » alors que la fiche est entamée : on le signale, en un clic.
  const statusHint =
    person.status === "Pas commencé" && score > 1 ? (
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-fg-subtle">
        {score} cases déjà remplies.
        <ActionButton
          action={quickStatusAction}
          fields={{ slug, personId: person.id, status: "En recherche" }}
          successMessage="Fiche passée en recherche"
          className="font-medium text-accent-text underline-offset-4 hover:underline"
        >
          Passer en recherche
        </ActionButton>
      </p>
    ) : null;

  const unionForm = (
    <>
      <Field label="Conjoint" hint="Choisissez une fiche existante ou tapez « Prénoms NOM » pour la créer.">
        <PersonSelect
          name="spouseId"
          people={pickable}
          placeholder="Rechercher ou créer…"
          autoFocus
          suggestions={suggestions.spouse}
          inlineList
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" hint="19/11/1882, v1880, 1882…">
          <input className="field" name="date_raw" placeholder="Date du mariage" />
        </Field>
        <Field label="Lieu">
          <PlaceField name="place" places={places} placeholder="Commune" />
        </Field>
      </div>
      <Field label="Acte" hint="Lien vers le registre en ligne ou cote d’archives.">
        <input className="field" name="source" placeholder="https://… ou cote" />
      </Field>
    </>
  );

  const addParent = (label: string, role: "father" | "mother") => (
    <FormDialog
      triggerClassName="text-xs text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
      trigger={label}
      title="Rattacher un parent"
      description={`Père ou mère de ${person.displayName}. Le sexe est déduit du prénom et se corrige sur la fiche.`}
      action={addParentAction}
      fields={{ slug, profileId: profile.id, childId: person.id }}
      submitLabel="Rattacher"
      successMessage="Parent rattaché"
    >
      <Field label="Parent" hint="Choisissez une fiche existante ou tapez « Prénoms NOM » pour la créer.">
        <PersonSelect
          name="parentId"
          people={pickable}
          placeholder="Rechercher ou créer…"
          autoFocus
          required
          suggestions={suggestions[role]}
          inlineList
        />
      </Field>
    </FormDialog>
  );

  const detach = (ref: PersonRef, childId: number, parentId: number, what: string) => (
    <ConfirmButton
      action={removeParentAction}
      fields={{ slug, profileId: profile.id, childId, parentId }}
      title={`Détacher ${ref.displayName} ?`}
      description={`Le lien de filiation avec ${person.displayName} sera retiré. Les deux fiches sont conservées.`}
      confirmLabel="Détacher"
      successMessage="Lien de filiation retiré"
      variant="quiet"
      size="icon-sm"
      buttonTitle={`Détacher ${what}`}
    >
      <IconUnlink size={13} />
    </ConfirmButton>
  );

  // Actions sur la fiche : colonne de droite sur ordinateur, tiroir « ⋯ » sur mobile.
  const actionList = (
    <>
      <GeneanetSearchButton person={person} className={buttonClass("quiet", "w-full justify-start")} />
      <Link href={`${base}/arbre?de=${person.id}`} className={buttonClass("quiet", "w-full justify-start")}>
        <IconTree size={14} />
        Voir dans l’arbre
      </Link>
      <Link
        href={`${base}/parente?de=${profile.root_person_id ?? ""}&avec=${person.id}`}
        className={buttonClass("quiet", "w-full justify-start")}
      >
        <IconMerge size={14} />
        Calculer la parenté
      </Link>
      {!isSosaRoot && (
        <ActionButton
          action={setRootPersonAction}
          fields={{ slug, profileId: profile.id, rootPersonId: person.id }}
          successMessage={`${person.displayName} est la nouvelle racine Sosa`}
          className={buttonClass("quiet", "w-full justify-start")}
          title="La numérotation Sosa repartira de cette personne"
        >
          <IconTarget size={14} />
          Définir comme racine (G1)
        </ActionButton>
      )}
      <ConfirmButton
        action={deletePersonAction}
        fields={{ slug, profileId: profile.id, personId: person.id }}
        title={`Supprimer la fiche de ${person.displayName} ?`}
        description="La fiche, ses unions, ses sources et ses liens de filiation seront définitivement supprimés. Les fiches des proches sont conservées."
        confirmLabel="Supprimer la fiche"
        className={buttonClass("danger-soft", "w-full justify-start")}
      >
        <IconTrash size={14} />
        Supprimer la fiche
      </ConfirmButton>
    </>
  );

  return (
    <div className="mx-auto flex max-w-[74rem] flex-col gap-6">
      <PersonPageEffects
        slug={slug}
        personId={person.id}
        prevHref={prev ? `${base}/personnes/${prev.id}` : null}
        nextHref={next ? `${base}/personnes/${next.id}` : null}
      />

      <PersonMobileBar
        title={person.displayName}
        prevHref={prev ? `${base}/personnes/${prev.id}` : null}
        nextHref={next ? `${base}/personnes/${next.id}` : null}
        position={`${index + 1} sur ${persons.length}`}
      >
        {actionList}
      </PersonMobileBar>

      {/* ----------------------------------------------------- fil d'Ariane */}
      <nav className="flex flex-wrap items-center justify-between gap-3 max-lg:hidden" aria-label="Fil d’Ariane">
        <div className="flex min-w-0 items-center gap-1.5 text-ui">
          <Link href={`${base}/personnes`} className="flex items-center gap-1.5 text-fg-muted transition-colors hover:text-fg">
            <IconArrowLeft size={14} />
            Personnes
          </Link>
          <span className="text-fg-subtle">/</span>
          <span className="truncate text-fg-muted">{person.displayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden items-center gap-1 text-2xs text-fg-subtle md:flex">
            <Kbd>K</Kbd>
            <Kbd>J</Kbd>
          </span>
          {prev ? (
            <Link href={`${base}/personnes/${prev.id}`} className={buttonClass("quiet", "max-w-48", "sm")} title={`Précédente : ${prev.displayName} (K)`}>
              <IconChevronLeft size={14} />
              <span className="hidden truncate sm:inline">{prev.displayName}</span>
            </Link>
          ) : (
            <span className={buttonClass("quiet", "pointer-events-none opacity-40", "sm")}>
              <IconChevronLeft size={14} />
            </span>
          )}
          <span className="num px-1 text-2xs text-fg-subtle">
            {index + 1} / {persons.length}
          </span>
          {next ? (
            <Link href={`${base}/personnes/${next.id}`} className={buttonClass("quiet", "max-w-48", "sm")} title={`Suivante : ${next.displayName} (J)`}>
              <span className="hidden truncate sm:inline">{next.displayName}</span>
              <IconChevronRight size={14} />
            </Link>
          ) : (
            <span className={buttonClass("quiet", "pointer-events-none opacity-40", "sm")}>
              <IconChevronRight size={14} />
            </span>
          )}
        </div>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        {/* ============================================== le document */}
        <article className="min-w-0">
          {/* Identité */}
          <header id="identite" className="flex scroll-mt-6 items-start gap-4">
            <div className="pt-1">
              <Avatar seed={person.id} given={person.given_names} surname={person.surname} size="xl" className="max-sm:!size-11" />
            </div>
            <div className="min-w-0 flex-1">
              {/* Prénoms et NOM se corrigent sur place, séparément. */}
              <h1 className="flex flex-wrap items-baseline gap-x-1 text-[1.75rem] font-semibold leading-tight tracking-tight">
                <Inline
                  slug={slug}
                  target={target("given_names")}
                  value={person.given_names}
                  placeholder="Prénoms"
                  label="Prénoms"
                  inputClassName="h-10 text-lg font-semibold"
                />
                <Inline
                  slug={slug}
                  target={target("surname")}
                  value={person.surname}
                  placeholder="NOM"
                  label="Nom de famille"
                  inputClassName="h-10 text-lg font-semibold"
                />
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-ui text-fg-muted">
                <Inline slug={slug} target={target("occupation")} value={person.occupation} placeholder="Ajouter un métier" label="Métier" />
                {person.sosa && (
                  <Badge title={`Numéro Sosa ${person.sosa}, génération ${generation}`}>
                    <span className="num">Sosa {person.sosa}</span>
                    {generation ? <span className="num text-fg-subtle">· G{generation}</span> : null}
                  </Badge>
                )}
                {isSosaRoot && (
                  <Badge tone="ink" title="Racine de la numérotation Sosa du profil">
                    G1 · racine
                  </Badge>
                )}
                {person.is_living ? <Badge tone="ok">Vivant(e)</Badge> : null}
                {person.kinship && person.kinship !== "SOSA" && person.kinship !== "Inconnu" && <Badge>{person.kinship}</Badge>}
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted first-letter:uppercase">{summarize(person)}</p>
            </div>
          </header>

          {/* Sur téléphone, statut et avancement remontent sous l'en-tête. */}
          <div className="mt-5 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 lg:hidden">
            <StatusPicker slug={slug} personId={person.id} status={person.status} appearance="plain" className="w-full" />
            {statusHint}
            <a href="#avancement" className="flex items-center gap-3 text-xs text-fg-muted">
              <SlotStrip score={score} total={total} missing={missing} ignored={ignored} className="flex-1" />
              <span className="num shrink-0">
                {score}/{total}
                {missing.length > 0 && <span className="text-fg-subtle"> · voir ce qui manque</span>}
              </span>
            </a>
          </div>

          {/* Rappels : ce qu'il reste à faire sur cette fiche, repris sur l'accueil */}
          <PersonReminders slug={slug} profileId={profile.id} personId={person.id} tasks={reminders} />

          {/* Incohérences */}
          {anomalies.length > 0 && (
            <div className="mt-6 rounded-lg bg-danger-soft px-4 py-3">
              <p className="flex items-center gap-2 text-ui font-semibold text-danger">
                <IconAlert size={15} />
                {anomalies.length} incohérence{anomalies.length > 1 ? "s" : ""} de dates
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 pl-6 text-ui text-fg-muted">
                {anomalies.map((a) => (
                  <li key={a.id} className="list-disc">
                    <strong className="font-medium text-fg">{a.title}</strong> — {a.description}
                    {a.relatedPersonId && a.relatedPersonName && (
                      <>
                        {" "}
                        <Link href={`${base}/personnes/${a.relatedPersonId}`} className="text-fg underline underline-offset-4">
                          voir {a.relatedPersonName}
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ------------------------------------------------- état civil */}
          <Section title="État civil">
            <div className={`hidden gap-x-4 pb-1.5 text-2xs font-medium text-fg-subtle md:grid ${EVENT_COLS}`}>
              <span />
              <span>Date</span>
              <span>Lieu</span>
              <span>Acte</span>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {/* Naissance */}
              <EventRow id="naissance" title="Naissance">
                <Cell label="Date">
                  <Inline
                    slug={slug}
                    target={target("birth_date_raw")}
                    value={person.birth_date_raw}
                    placeholder={
                      person.birth_year ? `vers ${person.birth_year}` : dispensed(person.birth_source_ignored, true) ? "Non requise" : "À trouver"
                    }
                    quietEmpty={dispensed(person.birth_source_ignored, person.birth_date_raw)}
                    variant="date"
                    label="Date de naissance"
                    cell
                  />
                </Cell>
                <Cell label="Lieu">
                  <Inline
                    slug={slug}
                    target={target("birth_place")}
                    value={person.birth_place}
                    placeholder={dispensed(person.birth_source_ignored, person.birth_place) ? "Non requis" : "À trouver"}
                    quietEmpty={dispensed(person.birth_source_ignored, person.birth_place)}
                    variant="place"
                    places={places}
                    label="Lieu de naissance"
                    cell
                  />
                </Cell>
                <Cell label="Acte">
                  <ActSlot
                    variant="cell"
                    slug={slug}
                    personId={person.id}
                    actKind="birth"
                    label="Acte"
                    value={person.birth_source}
                    isIgnored={Boolean(person.birth_source_ignored)}
                    localVersion={localActVersion({ kind: "person", personId: person.id, actKind: "birth" })}
                    viewerTitle={`Acte de naissance · ${person.displayName}`}
                  />
                </Cell>
              </EventRow>

              {/* Mariage(s) */}
              {person.unions.map((union, i) => (
                <EventRow
                  key={union.id}
                  id={i === 0 ? "mariage" : `mariage-${union.id}`}
                  title={person.unions.length > 1 ? `Mariage ${i + 1}` : "Mariage"}
                  aside={
                    <div className="flex flex-col items-start gap-1">
                      {union.spouse ? (
                        <Link
                          href={`${base}/personnes/${union.spouse.id}`}
                          className="max-w-full truncate text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                        >
                          avec {union.spouse.displayName}
                        </Link>
                      ) : (
                        <span className="text-xs text-fg-subtle">conjoint inconnu</span>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        <ConfirmButton
                          action={deleteUnionAction}
                          fields={{ slug, unionId: union.id }}
                          title="Retirer cette union ?"
                          description="La date, le lieu et l’acte de mariage saisis seront supprimés. Les fiches des deux conjoints sont conservées."
                          confirmLabel="Retirer l’union"
                          successMessage="Union retirée"
                          className="text-xs text-fg-subtle underline-offset-4 transition-colors hover:text-danger hover:underline"
                        >
                          Retirer ce mariage
                        </ConfirmButton>
                        {i === person.unions.length - 1 && (
                          <FormDialog
                            triggerClassName="text-xs text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
                            trigger="+ Autre mariage"
                            title="Ajouter un autre mariage"
                            description={`Remariage de ${person.displayName}.`}
                            action={saveUnionAction}
                            fields={ids}
                            submitLabel="Enregistrer le mariage"
                            successMessage="Mariage ajouté"
                          >
                            {unionForm}
                          </FormDialog>
                        )}
                      </div>
                    </div>
                  }
                >
                  <Cell label="Date">
                    <Inline
                      slug={slug}
                      target={{ kind: "union", unionId: union.id, field: "date_raw" }}
                      value={union.date_raw}
                      placeholder={union.year ? `vers ${union.year}` : dispensed(union.source_ignored, union.date_raw) ? "Non requise" : "À trouver"}
                      quietEmpty={dispensed(union.source_ignored, union.date_raw)}
                      variant="date"
                      label="Date de mariage"
                      cell
                    />
                  </Cell>
                  <Cell label="Lieu">
                    <Inline
                      slug={slug}
                      target={{ kind: "union", unionId: union.id, field: "place" }}
                      value={union.place}
                      placeholder={dispensed(union.source_ignored, union.place) ? "Non requis" : "À trouver"}
                      quietEmpty={dispensed(union.source_ignored, union.place)}
                      variant="place"
                      places={places}
                      label="Lieu de mariage"
                      cell
                    />
                  </Cell>
                  <Cell label="Acte">
                    <ActSlot
                      variant="cell"
                      slug={slug}
                      unionId={union.id}
                      actKind="marriage"
                      label="Acte"
                      value={union.source}
                      isIgnored={Boolean(union.source_ignored)}
                      localVersion={localActVersion({ kind: "union", unionId: union.id })}
                      viewerTitle={`Acte de mariage · ${person.displayName}${union.spouse ? ` & ${union.spouse.displayName}` : ""}`}
                    />
                  </Cell>
                </EventRow>
              ))}

              {person.unions.length === 0 && (
                <EventRow id="mariage" title="Mariage">
                  <WideCell>
                    {person.is_unmarried ? (
                      <span>Célibataire : aucun mariage n’est requis.</span>
                    ) : (
                      <>
                        <span className="underline decoration-border-strong decoration-dashed underline-offset-[5px]">
                          Aucun mariage enregistré
                        </span>
                        <FormDialog
                          triggerVariant="quiet"
                          triggerSize="xs"
                          trigger={
                            <>
                              <IconPlus size={12} />
                              Ajouter le mariage
                            </>
                          }
                          title="Ajouter un mariage"
                          description={`Conjoint de ${person.displayName}. Seul le conjoint est indispensable, et il peut être créé à la volée.`}
                          action={saveUnionAction}
                          fields={ids}
                          submitLabel="Enregistrer le mariage"
                          successMessage="Mariage ajouté"
                        >
                          {unionForm}
                        </FormDialog>
                      </>
                    )}
                  </WideCell>
                </EventRow>
              )}

              {/* Décès */}
              <EventRow id="deces" title="Décès">
                {person.is_living ? (
                  <WideCell>Personne vivante : ni date, ni lieu, ni acte de décès ne sont requis.</WideCell>
                ) : (
                  <>
                    <Cell label="Date">
                      <Inline
                        slug={slug}
                        target={target("death_date_raw")}
                        value={person.death_date_raw}
                        placeholder={
                          person.death_year ? `vers ${person.death_year}` : dispensed(person.death_source_ignored, true) ? "Non requise" : "À trouver"
                        }
                        quietEmpty={dispensed(person.death_source_ignored, person.death_date_raw)}
                        variant="date"
                        label="Date de décès"
                        cell
                      />
                    </Cell>
                    <Cell label="Lieu">
                      <Inline
                        slug={slug}
                        target={target("death_place")}
                        value={person.death_place}
                        placeholder={dispensed(person.death_source_ignored, person.death_place) ? "Non requis" : "À trouver"}
                        quietEmpty={dispensed(person.death_source_ignored, person.death_place)}
                        variant="place"
                        places={places}
                        label="Lieu de décès"
                        cell
                      />
                    </Cell>
                    <Cell label="Acte">
                      <ActSlot
                        variant="cell"
                        slug={slug}
                        personId={person.id}
                        actKind="death"
                        label="Acte"
                        value={person.death_source}
                        isIgnored={Boolean(person.death_source_ignored)}
                        localVersion={localActVersion({ kind: "person", personId: person.id, actKind: "death" })}
                        viewerTitle={`Acte de décès · ${person.displayName}`}
                      />
                    </Cell>
                  </>
                )}
              </EventRow>
            </div>
            <p className="mt-2 text-2xs text-fg-subtle">
              Touchez ou cliquez une valeur pour la modifier. Le menu <span className="font-medium">⋯</span> d’un acte permet de le
              dispenser s’il est introuvable.
            </p>
          </Section>

          {/* ---------------------------------------------------- famille */}
          <Section
            id="famille"
            title="Famille"
            action={
              <Link href={`${base}/arbre?de=${person.id}`} className={buttonClass("quiet", "", "sm")}>
                <IconTree size={13} />
                Voir dans l’arbre
              </Link>
            }
          >
            <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-1">
              <dt className="pt-2 text-xs text-fg-subtle">Père</dt>
              <dd className="min-w-0">
                {father ? (
                  <Relative slug={slug} person={father} detach={detach(father, person.id, father.id, "le père")} />
                ) : (
                  <div className="flex min-h-8 items-center gap-3 text-ui text-fg-subtle">
                    <span className="underline decoration-border-strong decoration-dashed underline-offset-[5px]">Inconnu</span>
                    {addParent("Rattacher", "father")}
                  </div>
                )}
              </dd>

              <dt className="pt-2 text-xs text-fg-subtle">Mère</dt>
              <dd className="min-w-0">
                {mother ? (
                  <Relative slug={slug} person={mother} detach={detach(mother, person.id, mother.id, "la mère")} />
                ) : (
                  <div className="flex min-h-8 items-center gap-3 text-ui text-fg-subtle">
                    <span className="underline decoration-border-strong decoration-dashed underline-offset-[5px]">Inconnue</span>
                    {addParent("Rattacher", "mother")}
                  </div>
                )}
              </dd>

              {otherParents.length > 0 && (
                <>
                  <dt className="pt-2 text-xs text-fg-subtle">Parent</dt>
                  <dd className="min-w-0">
                    {otherParents.map((p) => (
                      <Relative key={p.id} slug={slug} person={p} detach={detach(p, person.id, p.id, "ce parent")} />
                    ))}
                  </dd>
                </>
              )}

              <dt className="pt-2 text-xs text-fg-subtle">
                Enfants{person.children.length > 0 && <span className="num"> · {person.children.length}</span>}
              </dt>
              <dd className="min-w-0">
                {person.children.map((child) => (
                  <Relative key={child.id} slug={slug} person={child} detach={detach(child, child.id, person.id, "cet enfant")} />
                ))}
                <div className="flex min-h-8 items-center">
                  <FormDialog
                    triggerClassName="flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
                    trigger={
                      <>
                        <IconPlus size={12} />
                        {person.children.length ? "Rattacher un autre enfant" : "Rattacher un enfant"}
                      </>
                    }
                    title="Rattacher un enfant"
                    description={`Enfant de ${person.displayName}.`}
                    action={addChildAction}
                    fields={{ slug, profileId: profile.id, parentId: person.id }}
                    submitLabel="Rattacher"
                    successMessage="Enfant rattaché"
                  >
                    <Field label="Enfant" hint="Choisissez une fiche existante ou tapez « Prénoms NOM » pour la créer.">
                      <PersonSelect
                        name="childId"
                        people={pickable}
                        placeholder="Rechercher ou créer…"
                        autoFocus
                        required
                        suggestions={suggestions.child}
                        inlineList
                      />
                    </Field>
                  </FormDialog>
                </div>
              </dd>

              {person.siblings.length > 0 && (
                <>
                  <dt className="pt-2 text-xs text-fg-subtle">
                    Fratrie<span className="num"> · {person.siblings.length}</span>
                  </dt>
                  <dd className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-ui">
                    {person.siblings.map((s) => (
                      <Link key={s.id} href={`${base}/personnes/${s.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <Avatar seed={s.id} size="sm" className="!size-4" />
                        {s.displayName}
                        {s.birth_year && <span className="num text-xs text-fg-subtle">{s.birth_year}</span>}
                      </Link>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </Section>

          {/* ------------------------------------------------------ notes */}
          <Section title="Notes de recherche">
            <Inline
              slug={slug}
              target={target("notes")}
              value={person.notes}
              placeholder="Ajouter des hypothèses, les registres dépouillés, les incohérences à vérifier…"
              variant="long"
              label="Notes de recherche"
            />
          </Section>

          {/* ---------------------------------------------------- sources */}
          <Section
            title={
              <>
                Sources complémentaires{" "}
                {sources.length > 0 && <span className="num font-normal text-fg-subtle">{sources.length}</span>}
              </>
            }
            action={
              <FormDialog
                triggerVariant="quiet"
                triggerSize="sm"
                trigger={
                  <>
                    <IconPlus size={13} />
                    Ajouter
                  </>
                }
                title="Ajouter une source"
                description="Recensement, acte notarié, registre militaire, presse…"
                action={createSourceAction}
                fields={ids}
                submitLabel="Ajouter la source"
                successMessage="Source ajoutée"
              >
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <Field label="Type">
                    <select className="field" name="kind" defaultValue="Recensement">
                      {ACT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Intitulé">
                    <input className="field" name="label" placeholder="Recensement de Billé, 1901" required autoFocus />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <Field label="Date">
                    <input className="field" name="date_raw" placeholder="1901" />
                  </Field>
                  <Field label="Lien">
                    <input className="field" name="url" type="url" placeholder="https://…" />
                  </Field>
                </div>
              </FormDialog>
            }
          >
            {sources.length === 0 ? (
              <p className="text-ui text-fg-subtle">Aucune source en dehors des actes d’état civil.</p>
            ) : (
              <ul className="divide-y divide-border">
                {sources.map((s) => (
                  <li key={s.id} className="group flex items-center gap-3 py-2">
                    <span className="w-28 shrink-0 truncate text-xs text-fg-subtle">{s.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-ui">{s.label ?? "Sans titre"}</span>
                    {s.date_raw && <span className="num shrink-0 text-xs text-fg-subtle">{s.date_raw}</span>}
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass("quiet", "", "icon-sm")}
                        title="Consulter la source"
                        aria-label="Consulter la source"
                      >
                        <IconExternalLink size={13} />
                      </a>
                    )}
                    <ConfirmButton
                      action={deleteSourceAction}
                      fields={{ slug, sourceId: s.id }}
                      title="Supprimer cette source ?"
                      description={s.label ?? undefined}
                      successMessage="Source supprimée"
                      className={buttonClass("quiet", "opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100", "icon-sm")}
                      buttonTitle="Supprimer la source"
                    >
                      <IconTrash size={13} />
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </article>

        {/* ================================================ propriétés */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:border-l lg:border-border lg:pl-8">
          <div className="max-lg:hidden">
            <p className="mb-1 text-xs text-fg-subtle">Statut de recherche</p>
            <StatusPicker slug={slug} personId={person.id} status={person.status} appearance="plain" className="w-full" />
            {statusHint}
          </div>

          <div id="avancement" className="scroll-mt-6">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-xs text-fg-subtle">Avancement</p>
              <p className="num text-ui font-medium">
                {score}/{total}
                <span className="ml-1.5 text-xs font-normal text-fg-subtle">{percent} %</span>
              </p>
            </div>
            <SlotStrip score={score} total={total} missing={missing} ignored={ignored} size="md" />
            {orderedMissing.length > 0 ? (
              <ul className="mt-3 flex flex-col">
                {orderedMissing.map((c) => (
                  <li key={c} className="group/miss -mx-1.5 flex items-center rounded-md transition-colors hover:bg-surface-2">
                    <a
                      href={anchorOf(c)}
                      title={`Aller à « ${c} »`}
                      className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-xs text-fg"
                    >
                      <IconPlus size={11} className="shrink-0 text-fg-subtle" />
                      <span className="truncate underline-offset-4 group-hover/miss:underline">{c}</span>
                    </a>
                    <ActionButton
                      action={createTaskAction}
                      fields={{
                        slug,
                        profileId: profile.id,
                        person_id: person.id,
                        title: taskTitleFor(c),
                        kind: c.startsWith("Acte") ? c : "Autre",
                        archive: person.birth_place ?? person.death_place ?? "",
                        priority: person.sosa ? "Haute" : "Normale",
                      }}
                      successMessage={`Tâche ajoutée : ${taskTitleFor(c).toLowerCase()}`}
                      title={`Créer la tâche « ${taskTitleFor(c)} »`}
                      className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-fg-subtle opacity-0 transition-opacity hover:bg-surface hover:text-fg focus-visible:opacity-100 group-hover/miss:opacity-100"
                    >
                      <IconFlag size={12} />
                    </ActionButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ok">
                <IconCheck size={13} />
                {ignored.length ? "Complète, avec dispenses" : "Fiche complète"}
              </p>
            )}
            {orderedDone.length > 0 && (
              <details className="group mt-1.5">
                <summary className="flex list-none items-center gap-1 text-2xs text-fg-subtle hover:text-fg [&::-webkit-details-marker]:hidden">
                  <IconChevronRight size={11} className="transition-transform group-open:rotate-90" />
                  {filled.length} remplie{filled.length > 1 ? "s" : ""}
                  {ignored.length > 0 && ` · ${ignored.length} dispensée${ignored.length > 1 ? "s" : ""}`}
                </summary>
                <ul className="mt-1 flex flex-col">
                  {orderedDone.map((c) => (
                    <li key={c} className="flex items-center gap-2 py-0.5 text-xs text-fg-subtle">
                      {ignored.includes(c) ? (
                        <IconBan size={12} />
                      ) : (
                        <IconCheck size={12} strokeWidth={2.5} className="text-ok" />
                      )}
                      <span className={ignored.includes(c) ? "line-through" : ""}>{c}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {missing.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-2xs text-fg-subtle">
                <IconFlag size={10} /> au survol : créer une tâche pour la case
              </p>
            )}
          </div>

          <div className="flex flex-col border-t border-border pt-4">
            <Property label="Statut de vie" hint="Une personne vivante n’a pas besoin d’informations de décès">
              <SegmentedAction
                action={toggleLivingAction}
                fields={{ slug, personId: person.id }}
                name="isLiving"
                value={person.is_living ? "1" : "0"}
                label="Statut de vie"
                size="sm"
                options={[
                  { value: "0", label: "Décédé(e)" },
                  { value: "1", label: "Vivant(e)" },
                ]}
              />
            </Property>
            {person.unions.length === 0 && (
              <Property label="Situation" hint="Une personne célibataire n’a pas besoin d’informations de mariage">
                <SegmentedAction
                  action={toggleUnmarriedAction}
                  fields={{ slug, personId: person.id }}
                  name="isUnmarried"
                  value={person.is_unmarried ? "1" : "0"}
                  label="Situation"
                  size="sm"
                  options={[
                    { value: "0", label: "Mariage à trouver" },
                    { value: "1", label: "Célibataire" },
                  ]}
                />
              </Property>
            )}
            <Property label="Lien">
              <InlineSelect slug={slug} target={target("kinship")} value={person.kinship} options={KINSHIPS} emptyLabel="Non renseigné" className={PLAIN_SELECT} />
            </Property>
            <Property label="Sexe">
              <InlineSelect
                slug={slug}
                target={target("sex")}
                value={person.sex}
                options={["M", "F"]}
                labels={{ M: "Homme", F: "Femme" }}
                emptyLabel="Non renseigné"
                className={PLAIN_SELECT}
              />
            </Property>
            {(person.proximity_year || (!person.birth_year && !person.death_year)) && (
              <Property label="Époque estimée" hint="Aucune date connue : une année approximative pour situer la personne">
                <Inline
                  slug={slug}
                  target={target("proximity_year")}
                  value={person.proximity_year ? String(person.proximity_year) : null}
                  placeholder="ex. 1750"
                  label="Époque estimée"
                  className="justify-end text-ui"
                  inputClassName="h-7 w-24 text-right"
                />
              </Property>
            )}
          </div>


          <div className="-mx-2 flex flex-col border-t border-border pt-3 max-lg:hidden">{actionList}</div>
        </aside>
      </div>
    </div>
  );
}
