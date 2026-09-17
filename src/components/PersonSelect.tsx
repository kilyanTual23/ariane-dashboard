"use client";

import { useEffect, useId, useState } from "react";

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
  value: controlledId,
  onChange,
}: {
  /** Champ caché qui porte l'identifiant quand la personne existe déjà. */
  name: string;
  /** Champ qui porte le nom tapé ; par défaut « <name>Name ». */
  textName?: string;
  people: PickerPerson[];
  placeholder?: string;
  required?: boolean;
  value?: number | null;
  onChange?: (id: number | null) => void;
}) {
  const listId = useId();
  const initialPerson = people.find((p) => p.id === controlledId);
  const [text, setText] = useState(initialPerson ? personLabel(initialPerson) : "");

  useEffect(() => {
    if (controlledId !== undefined) {
      const p = people.find((x) => x.id === controlledId);
      setText(p ? personLabel(p) : "");
    }
  }, [controlledId, people]);

  const match = people.find((p) => personLabel(p) === text);
  const willCreate = !match && text.trim().length > 1;

  const handleChange = (newText: string) => {
    setText(newText);
    if (onChange) {
      const found = people.find((p) => personLabel(p) === newText);
      onChange(found?.id ?? null);
    }
  };

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <input
        className="field"
        name={textName ?? `${name}Name`}
        list={listId}
        value={text}
        placeholder={placeholder}
        required={required}
        onChange={(e) => handleChange(e.target.value)}
      />
      <datalist id={listId}>
        {people.map((p) => (
          <option key={p.id} value={personLabel(p)} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={match?.id ?? ""} />
      {willCreate && (
        <span className="text-[11px] text-fg-subtle">
          nouvelle carte « {text.trim()} » — prénoms puis NOM en majuscules
        </span>
      )}
    </span>
  );
}
