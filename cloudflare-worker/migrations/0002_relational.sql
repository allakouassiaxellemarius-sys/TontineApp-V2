-- =====================================================================
-- Migration 0002 — Schéma relationnel Tontine Manager
-- =====================================================================
-- Remplace le modèle « tout-en-blob » (table kv : users/<email>,
-- users/<uid>/tontines, users/<uid>/groupes, fcm/<uid>, auth/reset/<email>,
-- paiements/<code>, demandes/<code>) par des tables normalisées.
--
-- ✅ APPLIQUE le 2026-08-17 sur tontine-db (2b14d7ae…) via :
--   wrangler d1 execute tontine-db --remote --file=migrations/0002_relational.sql
-- (CREATE TABLE IF NOT EXISTS -> idempotent, re-executable sans risque).
--
-- Conventions :
--   - Dates = TEXT ISO 8601 (ex. 2026-08-17T18:35:13Z), comme côté app.
--   - Booléens = INTEGER 0/1 (SQLite n'a pas de BOOL).
--   - Listes rarement interrogées séparément = TEXT JSON.
--   - FKs déclarées pour documenter les relations (actives si
--     PRAGMA foreign_keys=ON au runtime).
-- =====================================================================

-- ── Comptes / Auth ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL UNIQUE,          -- minuscules
  uid             TEXT,                             -- id applicatif (Google ou généré)
  display_name    TEXT    NOT NULL DEFAULT '',
  auth_provider   TEXT    NOT NULL DEFAULT 'email', -- 'email' | 'google'
  password_salt   TEXT,
  password_hash   TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);

-- Jeton de réinitialisation (single-use, expiré par expires_at).
CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  token      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,                       -- epoch ms
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_resets_email ON password_resets(email);

-- ── Groupes (tontines) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groupes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code_unique       TEXT UNIQUE,                     -- code invit. 6 car. (null = sauvegarde privée)
  sauvegarde_uid    TEXT,                            -- clé sauvegarde privée compte
  proprietaire_uid  TEXT,                            -- uid du responsable
  nom               TEXT    NOT NULL DEFAULT 'Ma tontine',
  devise_symbole    TEXT    NOT NULL DEFAULT 'FCFA',
  devise_position   TEXT    NOT NULL DEFAULT 'after',-- 'before' | 'after'
  montant_cotisation REAL   NOT NULL DEFAULT 0,
  periode_jours     INTEGER NOT NULL DEFAULT 7,
  le_receveur_cotonise INTEGER NOT NULL DEFAULT 1,  -- booléen
  penalite_pct_par_jour REAL NOT NULL DEFAULT 0,
  penalite_plafond  REAL    NOT NULL DEFAULT 0,
  moyens_paiement   TEXT    NOT NULL DEFAULT '["Espèces"]', -- JSON array
  membres_min       INTEGER NOT NULL DEFAULT 0,
  membres_max       INTEGER NOT NULL DEFAULT 0,
  statut            TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'terminee'
  date_debut        TEXT,
  date_creation     TEXT,
  reception_mm      TEXT,                            -- JSON (config Mobile Money) ou null
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_groupes_code     ON groupes(code_unique);
CREATE INDEX IF NOT EXISTS idx_groupes_proprio ON groupes(proprietaire_uid);
CREATE INDEX IF NOT EXISTS idx_groupes_sauv    ON groupes(sauvegarde_uid);

-- ── Membres ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membres (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id     INTEGER NOT NULL,
  nom           TEXT    NOT NULL DEFAULT '',
  telephone     TEXT    NOT NULL DEFAULT '',
  email         TEXT    NOT NULL DEFAULT '',
  uid           TEXT,                               -- compte lié (null = invité)
  role          TEXT    NOT NULL DEFAULT 'membre',  -- 'membre' | 'tresorier' | 'co-responsable'
  bloque        INTEGER NOT NULL DEFAULT 0,
  date_adhesion TEXT,
  date_creation TEXT,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_membres_groupe ON membres(groupe_id);
CREATE INDEX IF NOT EXISTS idx_membres_uid    ON membres(uid);

-- ── Tours (cycles de réception du pot) ──────────────────────────
CREATE TABLE IF NOT EXISTS tours (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id      INTEGER NOT NULL,
  numero         INTEGER NOT NULL DEFAULT 0,
  membre_id      INTEGER,                           -- destinataire du pot
  date_prevue    TEXT,
  montant_pot    REAL    NOT NULL DEFAULT 0,
  statut         TEXT    NOT NULL DEFAULT 'en_attente', -- 'en_attente' | 'recu' | 'annule'
  date_reception TEXT,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE,
  FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tours_groupe ON tours(groupe_id);

-- ── Cotisations (paiements) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotisations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id       INTEGER NOT NULL,
  tour_id         INTEGER,
  membre_id       INTEGER,
  montant         REAL    NOT NULL DEFAULT 0,
  date_paiement   TEXT,
  statut          TEXT    NOT NULL DEFAULT 'en_attente', -- 'paye' | 'en_attente'
  penalite        REAL    NOT NULL DEFAULT 0,
  moyen_paiement  TEXT    NOT NULL DEFAULT '',
  mode_operateur  TEXT,
  mode_numero     TEXT,
  mode_reference  TEXT,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE,
  FOREIGN KEY (tour_id)  REFERENCES tours(id)  ON DELETE CASCADE,
  FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE SET NULL,
  UNIQUE (tour_id, membre_id)                  -- un paiement par membre/tour
);
CREATE INDEX IF NOT EXISTS idx_cotis_groupe ON cotisations(groupe_id);
CREATE INDEX IF NOT EXISTS idx_cotis_tour   ON cotisations(tour_id);

-- ── Prêts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id     INTEGER NOT NULL,
  emprunteur_id INTEGER,
  montant       REAL    NOT NULL DEFAULT 0,
  taux_interet  REAL    NOT NULL DEFAULT 0,
  date_echeance TEXT,
  date_creation TEXT,
  note          TEXT    NOT NULL DEFAULT '',
  statut        TEXT    NOT NULL DEFAULT 'en_cours', -- 'en_cours' | 'rembourse'
  remboursements TEXT   NOT NULL DEFAULT '[]',       -- JSON array
  FOREIGN KEY (groupe_id)    REFERENCES groupes(id) ON DELETE CASCADE,
  FOREIGN KEY (emprunteur_id) REFERENCES membres(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_prets_groupe ON prets(groupe_id);

-- ── Discussion de groupe (messages) ─────────────────────────────
CREATE TABLE IF NOT EXISTS groupe_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id  INTEGER NOT NULL,
  auteur     TEXT    NOT NULL DEFAULT 'Membre',
  uid        TEXT,
  email      TEXT,
  texte      TEXT    NOT NULL,
  date       TEXT,
  en_attente INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_groupe ON groupe_messages(groupe_id);

-- ── Annonces du responsable ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS groupe_annonces (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id INTEGER NOT NULL,
  auteur    TEXT    NOT NULL DEFAULT 'Responsable',
  texte     TEXT    NOT NULL,
  date      TEXT,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);

-- ── Journal d'activité ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groupe_journal (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id INTEGER NOT NULL,
  action   TEXT,
  libelle  TEXT,
  date     TEXT,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);

-- ── Ordre de passage tiré au sort ───────────────────────────────
CREATE TABLE IF NOT EXISTS groupe_ordre_tire (
  groupe_id  INTEGER NOT NULL,
  position   INTEGER NOT NULL,
  membre_id  INTEGER,
  PRIMARY KEY (groupe_id, position),
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE,
  FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE SET NULL
);

-- ── Co-gérants (uid -> nom/email) ───────────────────────────────
CREATE TABLE IF NOT EXISTS groupe_co_gerants (
  groupe_id INTEGER NOT NULL,
  uid       TEXT    NOT NULL,
  nom       TEXT    NOT NULL DEFAULT '',
  email     TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (groupe_id, uid),
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);

-- ── Archives annuelles (clôture d'exercice) ─────────────────────
CREATE TABLE IF NOT EXISTS groupe_archives (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  groupe_id     INTEGER NOT NULL,
  annee         INTEGER NOT NULL,
  date_archive  TEXT,
  total_cotis   REAL    NOT NULL DEFAULT 0,
  total_penalites REAL  NOT NULL DEFAULT 0,
  total_recu    REAL    NOT NULL DEFAULT 0,
  solde         REAL    NOT NULL DEFAULT 0,
  nb_tours      INTEGER NOT NULL DEFAULT 0,
  nb_paiements  INTEGER NOT NULL DEFAULT 0,
  par_membre    TEXT    NOT NULL DEFAULT '[]',       -- JSON
  UNIQUE (groupe_id, annee),
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);

-- ── Signalements de paiement (membre -> responsable) ────────────
CREATE TABLE IF NOT EXISTS pending_paiements (
  id             TEXT    PRIMARY KEY,                -- 'pai-...' (conservé tel quel)
  groupe_id      INTEGER NOT NULL,
  nom            TEXT    NOT NULL DEFAULT 'Membre',
  montant        REAL    NOT NULL DEFAULT 0,
  operateur      TEXT,
  numero_emetteur TEXT,
  reference      TEXT,
  tour_id        INTEGER,
  tour_numero    INTEGER,
  membre_id      INTEGER,
  date           TEXT,
  en_attente     INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pending_groupe ON pending_paiements(groupe_id);

-- ── Messages invités en attente (accusé de réception) ───────────
CREATE TABLE IF NOT EXISTS pending_messages (
  id         TEXT    PRIMARY KEY,                    -- 'inv-...'
  groupe_id  INTEGER NOT NULL,
  texte      TEXT    NOT NULL,
  auteur     TEXT    NOT NULL DEFAULT 'Membre',
  uid        TEXT,
  email      TEXT,
  date       TEXT,
  en_attente INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
);

-- ── Demandes d'inscription (invité -> responsable) ──────────────
CREATE TABLE IF NOT EXISTS demandes (
  id        TEXT    PRIMARY KEY,                     -- généré côté cloud
  code      TEXT    NOT NULL,                        -- code_unique du groupe
  nom       TEXT    NOT NULL,
  telephone TEXT,
  email     TEXT,
  uid       TEXT,
  maj_le    INTEGER,
  FOREIGN KEY (code) REFERENCES groupes(code_unique) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_demandes_code ON demandes(code);

-- ── Paiements en ligne confirmés (webhook PayDunya/Flutterwave) ─
CREATE TABLE IF NOT EXISTS paiements_en_ligne (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL,                    -- code_unique du groupe
  transaction_id TEXT,
  tour_id       INTEGER,
  membre_id     INTEGER,
  montant       REAL    NOT NULL DEFAULT 0,
  operateur     TEXT,
  numero        TEXT,
  reference     TEXT,
  statut        TEXT    NOT NULL DEFAULT 'paye',
  date          TEXT,
  FOREIGN KEY (code) REFERENCES groupes(code_unique) ON DELETE CASCADE,
  UNIQUE (transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_paiements_code ON paiements_en_ligne(code);
