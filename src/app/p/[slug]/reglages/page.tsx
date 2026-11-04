import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  createResourceAction,
  deleteProfileAction,
  deleteResourceAction,
  setRootPersonAction,
  updateProfileAction,
} from "@/app/actions";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { buttonClass, Card } from "@/components/ui";
import { GeneanetExportCard } from "@/components/GeneanetExportCard";
import { getProfileBySlug, listPersons, listResources } from "@/lib/queries";
import { logoutAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Réglages",
};

export default async function SettingsPage({ params }: PageProps<"/p/[slug]/reglages">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [persons, resources] = await Promise.all([
    listPersons(profile.id),
    listResources(profile.id),
  ]);
  const root = persons.find((p) => p.id === profile.root_person_id);
  const pickable: PickerPerson[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    birthYear: p.birth_year,
    deathYear: p.death_year,
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Réglages</h1>
      </header>

      <Card title="Profil">
        <form action={updateProfileAction} className="grid gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="profileId" value={profile.id} />
          <label className="block">
            <span className="label">Nom</span>
            <input className="field" name="name" defaultValue={profile.name} />
          </label>
          <label className="block">
            <span className="label">Description</span>
            <input className="field" name="description" defaultValue={profile.description ?? ""} />
          </label>
          <div>
            <button type="submit" className={buttonClass("primary")}>
              Enregistrer
            </button>
          </div>
        </form>
      </Card>

      <Card title="Racine de la numérotation Sosa">
        <p className="mb-3 text-sm text-fg-muted">
          Le « de cujus » porte le numéro 1 ; son père 2, sa mère 3, et ainsi de suite. C’est ce qui
          alimente le suivi par génération du tableau de bord.
        </p>
        <p className="mb-3 text-sm">
          Racine actuelle :{" "}
          <strong>{root ? root.displayName : "aucune"}</strong>
        </p>
        <form action={setRootPersonAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="profileId" value={profile.id} />
          <div className="min-w-64 flex-1">
            <PersonSelect name="rootPersonId" people={pickable} placeholder="Choisir la personne racine…" />
          </div>
          <button type="submit" className={buttonClass("primary")}>
            Définir
          </button>
          <button type="submit" name="rootPersonId" value="" className={buttonClass()}>
            Retirer
          </button>
        </form>
      </Card>

      <Card title="Liens utiles">
        {resources.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {resources.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                {r.category && (
                  <span className="rounded bg-surface-3 px-1.5 py-px text-[11px] text-fg-muted">
                    {r.category}
                  </span>
                )}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg underline underline-offset-4"
                >
                  {r.label} ↗
                </a>
                <form action={deleteResourceAction} className="ml-auto">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="resourceId" value={r.id} />
                  <button type="submit" className="text-xs text-fg-subtle hover:text-danger">
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={createResourceAction} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto]">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="profileId" value={profile.id} />
          <input className="field" name="label" placeholder="Archives de la Manche" required />
          <input className="field" name="url" placeholder="https://…" required />
          <input className="field" name="category" placeholder="Catégorie" />
          <button type="submit" className={buttonClass()}>
            Ajouter
          </button>
        </form>
      </Card>

      <Card title="Export vers Geneanet (GEDCOM)">
        <GeneanetExportCard slug={slug} />
      </Card>

      <Card title="Sauvegarde complète (JSON)">
        <p className="mb-3 text-sm text-fg-muted">
          Export brut au format JSON de l&apos;intégralité du profil : personnes, unions, filiations, tâches, ressources et sources. Idéal pour une sauvegarde locale technique ou une restauration.
        </p>
        <a href={`/api/profils/${slug}/export`} className={buttonClass()} download>
          Télécharger le JSON complet
        </a>
      </Card>

      <Card title="Sécurité">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">
            L&apos;accès à Ariane est protégé par mot de passe.
          </p>
          <form action={logoutAction}>
            <button type="submit" className={buttonClass("ghost")}>
              Se déconnecter
            </button>
          </form>
        </div>
      </Card>

      <Card title="Zone sensible">
        <form action={deleteProfileAction} className="flex items-center justify-between gap-3">
          <input type="hidden" name="profileId" value={profile.id} />
          <p className="text-sm text-fg-muted">
            Supprimer « {profile.name} » et l’ensemble de ses {persons.length} fiches.
          </p>
          <button type="submit" className={buttonClass("danger")}>
            Supprimer le profil
          </button>
        </form>
      </Card>
    </div>
  );
}
