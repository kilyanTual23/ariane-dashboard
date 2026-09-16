export const STATUSES = ["Pas commencé", "En recherche", "Bloqué", "Complet"] as const;
export type Status = (typeof STATUSES)[number];

export const KINSHIPS = [
  "SOSA",
  "Collatéral",
  "Pas de lien de parenté",
  "Inconnu",
] as const;
export type Kinship = (typeof KINSHIPS)[number];

export const TASK_STATUSES = ["À faire", "En cours", "Fait", "Abandonné"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["Haute", "Normale", "Basse"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACT_KINDS = [
  "Acte de naissance",
  "Acte de mariage",
  "Acte de décès",
  "Recensement",
  "Registre paroissial",
  "Notaire",
  "Militaire",
  "Autre",
] as const;

export type Profile = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  root_person_id: number | null;
  created_at: string;
  updated_at: string;
};

export type PersonRow = {
  id: number;
  profile_id: number;
  given_names: string;
  surname: string;
  sex: "M" | "F" | null;
  kinship: Kinship | null;
  sosa: number | null;
  status: Status;
  occupation: string | null;
  birth_date_raw: string | null;
  birth_date_iso: string | null;
  birth_year: number | null;
  birth_year_estimated: number;
  birth_place: string | null;
  birth_source: string | null;
  death_date_raw: string | null;
  death_date_iso: string | null;
  death_year: number | null;
  death_place: string | null;
  death_source: string | null;
  proximity_year: number | null;
  /** Date du report sur Geneanet ; renseignée, la carte est archivée. */
  geneanet_at: string | null;
  notes: string | null;
  notion_id: string | null;
  created_at: string;
  updated_at: string;
};

export type UnionRow = {
  id: number;
  profile_id: number;
  partner1_id: number | null;
  partner2_id: number | null;
  date_raw: string | null;
  date_iso: string | null;
  year: number | null;
  place: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
};

export type TaskRow = {
  id: number;
  profile_id: number;
  person_id: number | null;
  title: string;
  details: string | null;
  kind: string | null;
  priority: Priority;
  status: TaskStatus;
  archive: string | null;
  url: string | null;
  created_at: string;
  done_at: string | null;
};

export type SourceRow = {
  id: number;
  profile_id: number;
  person_id: number | null;
  kind: string;
  label: string | null;
  url: string | null;
  date_raw: string | null;
  place: string | null;
  notes: string | null;
  created_at: string;
};

export type ResourceRow = {
  id: number;
  profile_id: number;
  label: string;
  url: string;
  category: string | null;
  created_at: string;
};

/** Personne enrichie : relations résolues + complétion calculée. */
export type Person = PersonRow & {
  displayName: string;
  parents: PersonRef[];
  children: PersonRef[];
  siblings: PersonRef[];
  unions: (UnionRow & { spouse: PersonRef | null })[];
  completion: Completion;
};

export type PersonRef = {
  id: number;
  displayName: string;
  status: Status;
  kinship: Kinship | null;
  birth_year: number | null;
  death_year: number | null;
  sex: "M" | "F" | null;
};

export type Completion = {
  score: number; // 0..11
  total: number; // 11
  percent: number; // 0..100
  missing: string[];
  filled: string[];
};
