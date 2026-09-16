"use client";

import { useId, useState } from "react";

export type PickerPerson = {
  id: number;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
};

export function personLabel(p: PickerPerson) {
  const years = `${p.birthYear ?? "?"}–${p.deathYear ?? "?"}`;
  return `${p.name} (${years})`;
}

/**
 * Champ de saisie avec autocomplétion sur les personnes du profil.
 *
 * Si le nom tapé ne correspond à personne, il est transmis tel quel : le
 * formulaire crée alors la carte et la rattache dans la foulée. On peut donc
 * poser un nom maintenant et remplir la carte plus tard.
 */
export function PersonSelect({
  name,
  textName,
  people,
  placeholder = "Chercher ou créer une personne…",
  required = false,
}: {
  /** Champ caché qui porte l'identifiant quand la personne existe déjà. */
  name: string;
  /** Champ qui porte le nom tapé ; par défaut « <name>Name ». */
  textName?: string;
  people: PickerPerson[];
  placeholder?: string;
  required?: boolean;
}) {
  const listId = useId();
  const [value, setValue] = useState("");
  const match = people.find((p) => personLabel(p) === value);
  const willCreate = !match && value.trim().length > 1;

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <input
        className="field"
        name={textName ?? `${name}Name`}
        list={listId}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => setValue(e.target.value)}
      />
      <datalist id={listId}>
        {people.map((p) => (
          <option key={p.id} value={personLabel(p)} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={match?.id ?? ""} />
      {willCreate && (
        <span className="text-[11px] text-fg-subtle">
          nouvelle carte « {value.trim()} » — prénoms puis NOM en majuscules
        </span>
      )}
    </span>
  );
}
