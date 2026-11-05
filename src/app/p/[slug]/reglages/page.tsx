import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { deleteProfileAction, setRootPersonAction, updateProfileAction } from "@/app/actions";
import { logoutAction } from "@/app/login/actions";
import { ActionButton } from "@/components/ActionButton";
import { ConfirmButton } from "@/components/Dialog";
import { ActionForm } from "@/components/FormDialog";
import { GeneanetExportCard } from "@/components/GeneanetExportCard";
import { IconDownload, IconLogOut, IconTrash } from "@/components/icons";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { ThemeSelector } from "@/components/ThemeSelector";
import { Avatar, Badge, buttonClass, PageHeader } from "@/components/ui";
import { getProfileBySlug, listPersons } from "@/lib/queries";

/** Sommaire : on saute directement à la bonne section. */
const SECTIONS = [
  ["profil", "Profil"],
  ["racine", "Racine Sosa"],
  ["apparence", "Apparence"],
  ["export", "Export Geneanet"],
  ["sauvegarde", "Sauvegarde"],
  ["session", "Session"],
  ["danger", "Zone sensible"],
] as const;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Réglages",
};

/** Une section de réglages : intitulé et explication à gauche, contrôles à droite. */
function Section({
  id,
  title,
  description,
  children,
  danger = false,
}: {
  id?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section id={id} className="grid scroll-mt-6 grid-cols-[minmax(0,1fr)] gap-4 border-t border-border py-8 first:border-t-0 first:pt-2 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className={`text-sm font-semibold ${danger ? "text-danger" : ""}`}>{title}</h2>
        <p className="mt-1 text-ui text-fg-muted">{description}</p>
      </div>
      <div
        className={`min-w-0 rounded-xl border bg-surface p-5 shadow-xs ${danger ? "border-danger-dot/30" : "border-border"}`}
      >
        {children}
      </div>
    </section>
  );
}

export default async function SettingsPage({ params }: PageProps<"/p/[slug]/reglages">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  const root = persons.find((p) => p.id === profile.root_person_id);
  const pickable: PickerPerson[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    birthYear: p.birth_year,
    deathYear: p.death_year,
    sosa: p.sosa,
  }));

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader title="Réglages" description={`Profil « ${profile.name} » et préférences de cet appareil.`} />

      <nav aria-label="Sections des réglages" className="-mx-1 flex flex-wrap gap-1">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors hover:bg-surface-2 hover:text-fg ${
              id === "danger" ? "text-danger" : "text-fg-muted"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>

      <div>
        <Section id="profil" title="Profil" description="Le nom apparaît dans la barre latérale et la liste des profils.">
          <ActionForm
            action={updateProfileAction}
            fields={{ slug, profileId: profile.id }}
            successMessage="Profil enregistré"
            className="flex flex-col gap-4"
          >
            <label className="block">
              <span className="label">Nom</span>
              <input className="field" name="name" defaultValue={profile.name} required />
            </label>
            <label className="block">
              <span className="label">Description</span>
              <input className="field" name="description" defaultValue={profile.description ?? ""} placeholder="Facultatif" />
            </label>
            <div className="flex justify-end">
              <SubmitButton>Enregistrer</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section
          id="racine"
          title="Racine Sosa"
          description="Le « de cujus » porte le numéro 1, son père le 2, sa mère le 3… C’est ce qui numérote l’ascendance et alimente le suivi par génération."
        >
          {root ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
              <Avatar seed={root.id} given={root.given_names} surname={root.surname} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium">{root.displayName}</p>
                <p className="num text-xs text-fg-subtle">
                  {root.birth_year ?? "?"} – {root.is_living ? "vivant" : (root.death_year ?? "?")}
                </p>
              </div>
              <Badge tone="ink">G1</Badge>
              <ActionButton
                action={setRootPersonAction}
                fields={{ slug, profileId: profile.id, rootPersonId: "" }}
                successMessage="Racine retirée"
                variant="quiet"
                size="sm"
              >
                Retirer
              </ActionButton>
            </div>
          ) : (
            <p className="mb-4 text-ui text-fg-muted">Aucune racine : les numéros Sosa et les générations restent vides.</p>
          )}
          <ActionForm
            action={setRootPersonAction}
            fields={{ slug, profileId: profile.id }}
            successMessage="Racine Sosa mise à jour"
            className="flex flex-wrap items-end gap-2"
          >
            <label className="min-w-64 flex-1">
              <span className="label">{root ? "Changer de racine" : "Choisir la racine"}</span>
              <PersonSelect name="rootPersonId" people={pickable} placeholder="Rechercher une personne…" allowCreate={false} required />
            </label>
            <SubmitButton>Définir</SubmitButton>
          </ActionForm>
        </Section>

        <Section
          id="apparence"
          title="Apparence"
          description="Thème, couleur d’accent et taille d’affichage, enregistrés sur cet appareil."
        >
          <ThemeSelector />
        </Section>

        <Section
          id="export"
          title="Export Geneanet"
          description="Fichier GEDCOM 5.5.1 prêt à importer : dates normalisées, numéros Sosa, sources et protection des vivants."
        >
          <GeneanetExportCard slug={slug} />
        </Section>

        <Section
          id="sauvegarde"
          title="Sauvegarde"
          description="Export brut et complet du profil (fiches, unions, filiations, tâches, sources), à conserver en lieu sûr."
        >
          <a href={`/api/profils/${slug}/export`} className={buttonClass("secondary")} download>
            <IconDownload size={14} />
            Télécharger la sauvegarde JSON
          </a>
        </Section>

        <Section id="session" title="Session" description="L’accès à Ariane est protégé par mot de passe.">
          <form action={logoutAction} className="flex items-center justify-between gap-3">
            <p className="text-ui text-fg-muted">Fermer la session sur cet appareil.</p>
            <SubmitButton variant="secondary">
              <IconLogOut size={14} />
              Se déconnecter
            </SubmitButton>
          </form>
        </Section>

        <Section
          id="danger"
          title="Zone sensible"
          danger
          description="Action définitive. Pensez à télécharger une sauvegarde avant."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ui text-fg-muted">
              Supprimer « {profile.name} » et ses <span className="num">{persons.length}</span> fiches.
            </p>
            <ConfirmButton
              action={deleteProfileAction}
              fields={{ profileId: profile.id }}
              title="Supprimer définitivement ce profil ?"
              description={`Les ${persons.length} fiches, unions, tâches et sources du profil seront effacées. Cette action est irréversible.`}
              confirmLabel="Supprimer le profil"
              confirmText={profile.name}
              variant="danger"
            >
              <IconTrash size={14} />
              Supprimer le profil
            </ConfirmButton>
          </div>
        </Section>
      </div>
    </div>
  );
}
