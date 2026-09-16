import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addChildAction,
  setRootPersonAction,
  addParentAction,
  createSourceAction,
  createTaskAction,
  deletePersonAction,
  markGeneanetAction,
  deleteSourceAction,
  deleteUnionAction,
  removeParentAction,
  saveUnionAction,
} from "@/app/actions";
import { Disclosure } from "@/components/Disclosure";
import { Inline, InlineSelect } from "@/components/Inline";
import { monogram, SlotStrip } from "@/components/PersonCard";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { PlaceField } from "@/components/PlaceField";
import { StatusPicker } from "@/components/StatusPicker";
import { buttonClass } from "@/components/ui";
import { formatStamp, GENEANET_URL, publicationOf } from "@/lib/publication";
import { getProfileBySlug, listPersons, listPlaces, listSources } from "@/lib/queries";
import { generationOf } from "@/lib/stats";
import { summarize } from "@/lib/summary";
import { ACT_KINDS, KINSHIPS, type Person, type PersonRef } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Une case de la carte : son intitulé, sa valeur, et le vide qui se voit. */
function Slot({
  label,
  filled,
  children,
  className = "",
}: {
  label: string;
  filled: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`slot ${filled ? "" : "slot-empty"} ${className}`}>
      <span className="slot-label">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden text-sm">{children}</div>
    </div>
  );
}

function GroupTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2 mt-5 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="eyebrow">{children}</h2>
      {aside}
    </div>
  );
}

function Relation({ slug, person }: { slug: string; person: PersonRef }) {
  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      className="inline-flex items-baseline gap-1.5 underline-offset-4 transition-colors hover:underline"
    >
      {person.displayName}
      <span className="num text-[11px] text-fg-subtle">
        {person.birth_year ?? "?"}–{person.death_year ?? "?"}
      </span>
    </Link>
  );
}

export default async function PersonPage({
  params,
}: PageProps<"/p/[slug]/personnes/[id]">) {
  const { slug, id } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = listPersons(profile.id);
  const person: Person | undefined = persons.find((p) => p.id === Number(id));
  if (!person) notFound();

  const sources = listSources(person.id);
  const places = listPlaces(profile.id);
  const pickable: PickerPerson[] = persons
    .filter((p) => p.id !== person.id)
    .map((p) => ({
      id: p.id,
      name: p.displayName,
      birthYear: p.birth_year,
      deathYear: p.death_year,
    }));

  const generation = generationOf(person.sosa);
  const isSosaRoot = profile.root_person_id === person.id;
  const { score, total, missing } = person.completion;
  const publication = publicationOf(person);
  const target = (field: string) => ({
    kind: "person" as const,
    personId: person.id,
    field,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/p/${slug}/personnes`}
          className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Toutes les cartes
        </Link>
        <Link
          href={`/p/${slug}/arbre?de=${person.id}`}
          className="text-[13px] text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Voir dans l’arbre →
        </Link>
      </div>

      {/* ---------------------------------------------------------- la carte */}
      <article className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7">
        <SlotStrip score={score} total={total} missing={missing} />

        <header className="mt-5 flex flex-wrap items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-medium tracking-wide text-fg-muted">
            {monogram(person.given_names, person.surname)}
          </span>

          <div className="min-w-0 flex-1">
            {/* Prénoms et NOM se corrigent sur place, séparément : rien à deviner
                sur l'endroit où s'arrête l'un et où commence l'autre. */}
            <h1 className="flex flex-wrap items-baseline gap-x-2 text-[28px] font-medium leading-[1.15] tracking-[-0.025em]">
              <Inline
                slug={slug}
                target={target("given_names")}
                value={person.given_names}
                placeholder="Prénoms"
              />
              <Inline
                slug={slug}
                target={target("surname")}
                value={person.surname}
                placeholder="NOM"
              />
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
              <Inline
                slug={slug}
                target={target("occupation")}
                value={person.occupation}
                placeholder="+ métier"
              />
              {person.sosa && (
                <span className="num text-fg-subtle">
                  Sosa {person.sosa}
                  {generation ? ` · G${generation}` : ""}
                </span>
              )}
              {isSosaRoot ? (
                <span className="num rounded bg-fg px-1.5 py-px text-[10px] leading-4 text-accent-fg">
                  G1 · racine du profil
                </span>
              ) : (
                <form action={setRootPersonAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="rootPersonId" value={person.id} />
                  <button
                    type="submit"
                    className="text-[13px] text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
                    title="La numérotation Sosa repartira de cette personne"
                  >
                    définir comme G1
                  </button>
                </form>
              )}
            </div>
          </div>

          <StatusPicker
            slug={slug}
            personId={person.id}
            status={person.status}
          />
        </header>

        <p className="mt-5 text-[15px] leading-relaxed text-fg-muted">
          {summarize(person)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="text-fg-subtle">
            <span className="num">
              {score}/{total}
            </span>{" "}
            cases remplies
          </span>
          {missing.length > 0 && (
            <form action={createTaskAction} className="inline">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="profileId" value={profile.id} />
              <input type="hidden" name="person_id" value={person.id} />
              <input
                type="hidden"
                name="title"
                value={`${missing[0]} — ${person.displayName}`}
              />
              <input
                type="hidden"
                name="kind"
                value={missing[0]?.startsWith("Acte") ? missing[0] : "Autre"}
              />
              <input
                type="hidden"
                name="archive"
                value={person.birth_place ?? person.death_place ?? ""}
              />
              <button
                type="submit"
                className="text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
              >
                mettre « {missing[0].toLowerCase()} » dans ma liste
              </button>
            </form>
          )}
        </div>

        {publication === "à mettre sur Geneanet" && (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
            <span className="size-2 shrink-0 rounded-full bg-warn" />
            <span className="text-fg">
              Carte terminée ({person.status.toLowerCase()}) — il reste à la reporter sur Geneanet.
            </span>
            <a
              href={GENEANET_URL}
              target="_blank"
              rel="noreferrer"
              className="text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
            >
              ouvrir Geneanet ↗
            </a>
            <form action={markGeneanetAction} className="ml-auto">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="personId" value={person.id} />
              <input type="hidden" name="done" value="1" />
              <button type="submit" className={buttonClass("primary", "py-1.5")}>
                C’est reporté, archiver
              </button>
            </form>
          </div>
        )}

        {publication === "archivée" && (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-[13px] text-fg-muted">
            <span className="text-ok">✓</span>
            <span>
              Archivée — reportée sur Geneanet le {formatStamp(person.geneanet_at)}. Cette carte est
              considérée comme terminée.
            </span>
            <form action={markGeneanetAction} className="ml-auto">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="personId" value={person.id} />
              <input type="hidden" name="done" value="0" />
              <button
                type="submit"
                className="text-[13px] text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
              >
                rouvrir la carte
              </button>
            </form>
          </div>
        )}

        {/* ------------------------------------------------------- les cases */}
        <div className="mt-7 border-t border-border pt-5">
          <GroupTitle>Naissance</GroupTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            <Slot label="Date" filled={!!person.birth_date_raw}>
              <Inline
                slug={slug}
                target={target("birth_date_raw")}
                value={person.birth_date_raw}
                placeholder={
                  person.birth_year ? `vers ${person.birth_year}` : "à remplir"
                }
                variant="date"
                fill
              />
            </Slot>
            <Slot label="Lieu" filled={!!person.birth_place}>
              <Inline
                slug={slug}
                target={target("birth_place")}
                value={person.birth_place}
                placeholder="à remplir"
                variant="place"
                places={places}
                fill
              />
            </Slot>
            <Slot label="Acte" filled={!!person.birth_source}>
              <Inline
                slug={slug}
                target={target("birth_source")}
                value={person.birth_source}
                placeholder="lien ou cote"
                variant="source"
                fill
              />
            </Slot>
          </div>

          {person.unions.map((union) => (
            <div key={union.id}>
              <GroupTitle
                aside={
                  <form action={deleteUnionAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="unionId" value={union.id} />
                    <button
                      type="submit"
                      className="text-[11px] text-fg-subtle transition-colors hover:text-danger"
                    >
                      retirer cette union
                    </button>
                  </form>
                }
              >
                Mariage{" "}
                {union.spouse && (
                  <span className="font-normal text-fg-muted">
                    avec {union.spouse.displayName}
                  </span>
                )}
              </GroupTitle>
              <div className="grid gap-2 sm:grid-cols-3">
                <Slot label="Date" filled={!!union.date_raw}>
                  <Inline
                    slug={slug}
                    target={{
                      kind: "union",
                      unionId: union.id,
                      field: "date_raw",
                    }}
                    value={union.date_raw}
                    placeholder="à remplir"
                    variant="date"
                    fill
                  />
                </Slot>
                <Slot label="Lieu" filled={!!union.place}>
                  <Inline
                    slug={slug}
                    target={{
                      kind: "union",
                      unionId: union.id,
                      field: "place",
                    }}
                    value={union.place}
                    placeholder="à remplir"
                    variant="place"
                    places={places}
                    fill
                  />
                </Slot>
                <Slot label="Acte" filled={!!union.source}>
                  <Inline
                    slug={slug}
                    target={{
                      kind: "union",
                      unionId: union.id,
                      field: "source",
                    }}
                    value={union.source}
                    placeholder="lien ou cote"
                    variant="source"
                    fill
                  />
                </Slot>
              </div>
            </div>
          ))}

          {person.unions.length === 0 && (
            <>
              <GroupTitle>Mariage</GroupTitle>
              <Disclosure label="+ ajouter un mariage">
                <form
                  action={saveUnionAction}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="personId" value={person.id} />
                  <PersonSelect
                    name="spouseId"
                    people={pickable}
                    placeholder="Conjoint…"
                  />
                  <input className="field" name="date_raw" placeholder="Date" />
                  <PlaceField name="place" places={places} />
                  <input
                    className="field"
                    name="source"
                    placeholder="Acte de mariage"
                  />
                  <button
                    type="submit"
                    className={buttonClass("primary", "sm:col-span-2")}
                  >
                    Enregistrer le mariage
                  </button>
                </form>
              </Disclosure>
            </>
          )}

          <GroupTitle>Décès</GroupTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            <Slot label="Date" filled={!!person.death_date_raw}>
              <Inline
                slug={slug}
                target={target("death_date_raw")}
                value={person.death_date_raw}
                placeholder="à remplir"
                variant="date"
                fill
              />
            </Slot>
            <Slot label="Lieu" filled={!!person.death_place}>
              <Inline
                slug={slug}
                target={target("death_place")}
                value={person.death_place}
                placeholder="à remplir"
                variant="place"
                places={places}
                fill
              />
            </Slot>
            <Slot label="Acte" filled={!!person.death_source}>
              <Inline
                slug={slug}
                target={target("death_source")}
                value={person.death_source}
                placeholder="lien ou cote"
                variant="source"
                fill
              />
            </Slot>
          </div>

          <GroupTitle
            aside={
              person.parents.length < 2 ? (
                <Disclosure label="+ rattacher un parent">
                  <form action={addParentAction} className="flex items-start gap-2">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="childId" value={person.id} />
                    <PersonSelect
                      name="parentId"
                      people={pickable}
                      placeholder="Nom, ou nouvelle personne…"
                    />
                    <button type="submit" className={buttonClass()}>
                      Rattacher
                    </button>
                  </form>
                </Disclosure>
              ) : undefined
            }
          >
            Parents
          </GroupTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {person.parents.map((parent) => (
              <Slot
                key={parent.id}
                label={
                  parent.sex === "F"
                    ? "Mère"
                    : parent.sex === "M"
                      ? "Père"
                      : "Parent"
                }
                filled
              >
                <span className="flex items-center justify-between gap-2">
                  <Relation slug={slug} person={parent} />
                  <form action={removeParentAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="childId" value={person.id} />
                    <input type="hidden" name="parentId" value={parent.id} />
                    <button
                      type="submit"
                      className="text-xs text-fg-subtle transition-colors hover:text-danger"
                      title="Détacher"
                    >
                      ✕
                    </button>
                  </form>
                </span>
              </Slot>
            ))}
            {Array.from(
              { length: Math.max(0, 2 - person.parents.length) },
              (_, i) => (
                <Slot key={`vide-${i}`} label="Parent" filled={false}>
                  <span className="italic text-fg-subtle">inconnu</span>
                </Slot>
              ),
            )}
          </div>

          <GroupTitle
            aside={
              <Disclosure label="+ rattacher un enfant">
                <form action={addChildAction} className="flex items-start gap-2">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="parentId" value={person.id} />
                  <PersonSelect
                    name="childId"
                    people={pickable}
                    placeholder="Nom, ou nouvelle personne…"
                  />
                  <button type="submit" className={buttonClass()}>
                    Rattacher
                  </button>
                </form>
              </Disclosure>
            }
          >
            Enfants
          </GroupTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {person.children.map((child) => (
              <Slot key={child.id} label="Enfant" filled>
                <span className="flex items-center justify-between gap-2">
                  <Relation slug={slug} person={child} />
                  <form action={removeParentAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="childId" value={child.id} />
                    <input type="hidden" name="parentId" value={person.id} />
                    <button
                      type="submit"
                      className="text-xs text-fg-subtle transition-colors hover:text-danger"
                      title="Détacher"
                    >
                      ✕
                    </button>
                  </form>
                </span>
              </Slot>
            ))}
            {person.children.length === 0 && (
              <Slot label="Enfant" filled={false}>
                <span className="italic text-fg-subtle">aucun rattaché</span>
              </Slot>
            )}
          </div>
        </div>
      </article>

      {/* ------------------------------------------------------- hors carte */}
      <section className="mt-8">
        {person.siblings.length > 0 && (
          <>
            <GroupTitle>Fratrie</GroupTitle>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {person.siblings.map((sibling) => (
                <li key={sibling.id}>
                  <Relation slug={slug} person={sibling} />
                </li>
              ))}
            </ul>
          </>
        )}

        <GroupTitle>Notes de recherche</GroupTitle>
        <Inline
          slug={slug}
          target={target("notes")}
          value={person.notes}
          placeholder="+ hypothèses, registres dépouillés, incohérences…"
          variant="long"
          className="w-full"
        />

        <GroupTitle>Sources complémentaires</GroupTitle>
        {sources.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline gap-2 text-sm"
              >
                <span className="text-[11px] text-fg-subtle">{s.kind}</span>
                <span>{s.label ?? "Sans titre"}</span>
                {s.date_raw && (
                  <span className="num text-xs text-fg-subtle">
                    {s.date_raw}
                  </span>
                )}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline underline-offset-4"
                  >
                    consulter ↗
                  </a>
                )}
                <form action={deleteSourceAction} className="ml-auto">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="sourceId" value={s.id} />
                  <button
                    type="submit"
                    className="text-xs text-fg-subtle transition-colors hover:text-danger"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <Disclosure label="+ ajouter une source (recensement, notaire, presse…)">
          <form
            action={createSourceAction}
            className="grid gap-2 sm:grid-cols-2"
          >
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="profileId" value={profile.id} />
            <input type="hidden" name="personId" value={person.id} />
            <select className="field" name="kind" defaultValue="Recensement">
              {ACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className="field"
              name="label"
              placeholder="Intitulé"
              required
            />
            <input className="field" name="date_raw" placeholder="Date" />
            <input className="field" name="url" placeholder="https://…" />
            <button
              type="submit"
              className={buttonClass("primary", "sm:col-span-2")}
            >
              Ajouter la source
            </button>
          </form>
        </Disclosure>

        <GroupTitle>Classement</GroupTitle>
        <div className="flex flex-wrap items-center gap-2">
          <InlineSelect
            slug={slug}
            target={target("kinship")}
            value={person.kinship}
            options={KINSHIPS}
            emptyLabel="Lien ?"
          />
          <InlineSelect
            slug={slug}
            target={target("sex")}
            value={person.sex}
            options={["M", "F"]}
            emptyLabel="Sexe ?"
          />
          <span className="text-xs text-fg-subtle">
            année de proximité{" "}
            <Inline
              slug={slug}
              target={target("proximity_year")}
              value={
                person.proximity_year ? String(person.proximity_year) : null
              }
              placeholder="+"
            />
          </span>
        </div>
      </section>

      <footer className="mt-12 border-t border-border pt-5">
        <Disclosure label="Supprimer cette carte">
          <form action={deletePersonAction} className="flex items-center gap-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="profileId" value={profile.id} />
            <input type="hidden" name="personId" value={person.id} />
            <p className="text-sm text-fg-muted">
              La carte et ses rattachements seront perdus.
            </p>
            <button type="submit" className={buttonClass("danger")}>
              Supprimer
            </button>
          </form>
        </Disclosure>
      </footer>
    </div>
  );
}
