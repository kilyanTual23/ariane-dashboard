/**
 * Recherche de registres dans les archives départementales en ligne.
 * Chaque département passe par une plateforme différente (Thot, Pleade, Ligeo…) :
 * un connecteur par plateforme, une forme de résultat commune.
 */

export type ActKind = "birth" | "marriage" | "death";

export type ArchiveRegister = {
  /** Identifiant stable dans la liste (cote ou identifiant de la plateforme). */
  id: string;
  dept: string;
  commune: string;
  /** Paroisse ou subdivision (« Saint-Léonard », « Rillé »…), quand le site la donne. */
  parish: string | null;
  /** Libellé du site : « Baptêmes/Mariages/Sépultures », « Naissances »… */
  typeLabel: string;
  kinds: ActKind[];
  isTable: boolean;
  /** « 1730 » ou « 1729-1739 ». */
  years: string;
  cote: string | null;
  pages: number | null;
  /** Lien permanent vers la visionneuse du site, première page du registre. */
  url: string;
};

export type ArchiveSearchResult =
  | { ok: true; dept: string; deptName: string; commune: string; year: number; registers: ArchiveRegister[]; note?: string }
  | { ok: false; error: string; suggestions?: string[] };

export type DepartmentConnector = {
  code: string;
  name: string;
  /** Nom de la plateforme, pour les messages. */
  platform: string;
  search: (commune: string, year: number) => Promise<ArchiveSearchResult>;
};
