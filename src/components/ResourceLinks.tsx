import { createResourceAction, deleteResourceAction } from "@/app/actions";
import { ConfirmButton } from "@/components/Dialog";
import { ActionForm } from "@/components/FormDialog";
import { IconExternalLink, IconPlus, IconTrash } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, buttonClass } from "@/components/ui";
import type { ResourceRow } from "@/lib/types";

/**
 * Liens utiles : archives départementales, bases en ligne, outils. Ils vivent à
 * côté des tâches, là où l'on prépare ses recherches.
 */
export function ResourceLinks({
  slug,
  profileId,
  resources,
}: {
  slug: string;
  profileId: number;
  resources: ResourceRow[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {resources.length > 0 ? (
        <ul className="-my-1 divide-y divide-border">
          {resources.map((r) => (
            <li key={r.id} className="group flex items-center gap-2 py-1.5">
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-ui hover:underline"
                title={r.category ? `${r.category} · ${r.url}` : r.url}
              >
                <span className="truncate">{r.label}</span>
                <IconExternalLink size={12} className="shrink-0 text-fg-subtle" />
              </a>
              {r.category && <Badge className="hidden shrink-0 sm:inline-flex">{r.category}</Badge>}
              <ConfirmButton
                action={deleteResourceAction}
                fields={{ slug, resourceId: r.id }}
                title="Retirer ce lien ?"
                description={r.label}
                confirmLabel="Retirer"
                successMessage="Lien retiré"
                variant="quiet"
                size="icon-sm"
                className={buttonClass("quiet", "opacity-0 group-hover:opacity-100 focus:opacity-100", "icon-sm")}
                buttonTitle="Retirer ce lien"
              >
                <IconTrash size={13} />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui text-fg-muted">Ajoutez les sites d’archives que vous consultez le plus.</p>
      )}
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
          <IconPlus size={12} />
          Ajouter un lien
        </summary>
        <ActionForm
          action={createResourceAction}
          fields={{ slug, profileId }}
          successMessage="Lien ajouté"
          className="mt-2 flex flex-col gap-2"
        >
          <input className="field" name="label" placeholder="Archives de la Manche" required aria-label="Intitulé" />
          <input className="field" name="url" type="url" placeholder="https://…" required aria-label="Adresse" />
          <div className="flex gap-2">
            <input className="field" name="category" placeholder="Catégorie (facultatif)" aria-label="Catégorie" />
            <SubmitButton variant="secondary">Ajouter</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
