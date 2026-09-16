"use client";

import { useId } from "react";

/**
 * Champ de lieu dans un formulaire classique : les lieux déjà écrits dans le
 * profil sont proposés, pour que la même commune s'écrive toujours pareil.
 */
export function PlaceField({
  name,
  places,
  placeholder = "Lieu",
  defaultValue,
  className = "field",
}: {
  name: string;
  places: string[];
  placeholder?: string;
  defaultValue?: string | null;
  className?: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        className={className}
        name={name}
        list={listId}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
      />
      <datalist id={listId}>
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}
