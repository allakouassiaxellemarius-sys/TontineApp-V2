-- Découverte de groupes publics : colonnes de visibilité + description
-- Rend un groupe visible dans l'explorateur (public = 1) ou non (0, défaut).
ALTER TABLE groupes ADD COLUMN public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE groupes ADD COLUMN description TEXT;
CREATE INDEX IF NOT EXISTS idx_groupes_public ON groupes(public) WHERE public = 1 AND statut = 'active';
