PRAGMA foreign_keys = ON;

-- Un profil = un projet de recherche indépendant (un arbre)
CREATE TABLE IF NOT EXISTS profiles (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  root_person_id INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS persons (
  id              INTEGER PRIMARY KEY,
  profile_id      INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  given_names     TEXT NOT NULL DEFAULT '',
  surname         TEXT NOT NULL DEFAULT '',
  sex             TEXT,              -- 'M' | 'F' | NULL
  kinship         TEXT,              -- SOSA | Collatéral | Pas de lien de parenté | Inconnu
  sosa            INTEGER,           -- numéro Sosa-Stradonitz (calculé depuis la racine)
  status          TEXT NOT NULL DEFAULT 'Pas commencé',  -- état de la recherche
  occupation      TEXT,

  birth_date_raw  TEXT,
  birth_date_iso  TEXT,
  birth_year      INTEGER,
  birth_year_estimated INTEGER NOT NULL DEFAULT 0,
  birth_place     TEXT,
  birth_source    TEXT,
  birth_source_ignored INTEGER NOT NULL DEFAULT 0,

  death_date_raw  TEXT,
  death_date_iso  TEXT,
  death_year      INTEGER,
  death_place     TEXT,
  death_source    TEXT,
  death_source_ignored INTEGER NOT NULL DEFAULT 0,
  is_living       INTEGER NOT NULL DEFAULT 0,
  is_unmarried    INTEGER NOT NULL DEFAULT 0,

  proximity_year  INTEGER,           -- année qui situe la personne (aide à la recherche)
  geneanet_at     TEXT,              -- date du report sur Geneanet : la carte est archivée
  notes           TEXT,
  notion_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_persons_profile ON persons(profile_id);
CREATE INDEX IF NOT EXISTS idx_persons_surname ON persons(profile_id, surname);

-- Union / mariage entre deux personnes
CREATE TABLE IF NOT EXISTS unions (
  id           INTEGER PRIMARY KEY,
  profile_id   INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  partner1_id  INTEGER REFERENCES persons(id) ON DELETE CASCADE,
  partner2_id  INTEGER REFERENCES persons(id) ON DELETE CASCADE,
  date_raw     TEXT,
  date_iso     TEXT,
  year         INTEGER,
  place        TEXT,
  source       TEXT,
  source_ignored INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_unions_profile ON unions(profile_id);
CREATE INDEX IF NOT EXISTS idx_unions_p1 ON unions(partner1_id);
CREATE INDEX IF NOT EXISTS idx_unions_p2 ON unions(partner2_id);

CREATE TABLE IF NOT EXISTS parent_child (
  parent_id  INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  child_id   INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_child ON parent_child(child_id);

-- Sources / actes supplémentaires (recensements, notariat, presse…)
CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  person_id   INTEGER REFERENCES persons(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'Autre',
  label       TEXT,
  url         TEXT,
  date_raw    TEXT,
  place       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sources_person ON sources(person_id);

-- Liste de travail
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  person_id   INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  details     TEXT,
  kind        TEXT,               -- Acte de naissance / mariage / décès / Recensement / Autre
  priority    TEXT NOT NULL DEFAULT 'Normale',  -- Haute | Normale | Basse
  status      TEXT NOT NULL DEFAULT 'À faire',  -- À faire | En cours | Fait | Abandonné
  archive     TEXT,               -- dépôt / registre concerné
  url         TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  done_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_profile ON tasks(profile_id, status);

-- Liens utiles par profil (archives départementales, outils…)
CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  category    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
