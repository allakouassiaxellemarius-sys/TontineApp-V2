-- =====================================================================
-- Migration 0003 — Migration des DONNÉES (kv blobs -> tables relationnelles)
-- =====================================================================
-- À exécuter UNIQUEMENT APRÈS la 0002 (création des tables), via :
--   wrangler d1 execute tontine-db --remote --file=migrations/0003_data_migration.sql
--
-- ✅ APPLIQUE le 2026-08-17 sur tontine-db. Ne modifie PAS la table kv
--   (rollback possible via scripts/rollback_prod.sql).
--
-- Hypothèses (vraies pour les données monoposte de l'app) :
--   * Les ids de membres / tours / cotisations / prets sont globalement
--     uniques (nextId() porte sur le stockage global de l'appareil). On
--     conserve donc ces ids comme PK -> le remappage des FK est trivial.
--   * Chaque snapshot de groupe vit sous une clé users/<uid>/tontines/<code>
--     (ou users/<uid>/sauvegardes/<sauvegardeUid>). Le groupe est dédupliqué
--     par code_unique (ou sauvegarde_uid). INSERT OR IGNORE évite les doublons.
--   * La table kv est CONSERVÉE (rollback possible) ; ne pas la supprimer ici.
-- =====================================================================

-- ── 1) Groupes (tontines) ─────────────────────────────────────────
INSERT OR IGNORE INTO groupes (
  code_unique, sauvegarde_uid, proprietaire_uid, nom,
  devise_symbole, devise_position, montant_cotisation, periode_jours,
  le_receveur_cotonise, penalite_pct_par_jour, penalite_plafond,
  moyens_paiement, membres_min, membres_max, statut,
  date_debut, date_creation, reception_mm
)
SELECT DISTINCT
  json_extract(kv.value, '$.groupe.codeUnique'),
  json_extract(kv.value, '$.groupe.sauvegardeUid'),
  COALESCE(json_extract(kv.value, '$.groupe.proprietaire'), json_extract(kv.value, '$.groupe.proprietaireUid')),
  json_extract(kv.value, '$.groupe.nom'),
  json_extract(kv.value, '$.groupe.deviseSymbole'),
  json_extract(kv.value, '$.groupe.devisePosition'),
  CAST(COALESCE(json_extract(kv.value, '$.groupe.montantCotisation'), 0) AS REAL),
  CAST(COALESCE(json_extract(kv.value, '$.groupe.periodeJours'), 7) AS INTEGER),
  CASE WHEN json_extract(kv.value, '$.groupe.leReceveurCotonise') = 0 THEN 0 ELSE 1 END,
  CAST(COALESCE(json_extract(kv.value, '$.groupe.penalitePctParJour'), 0) AS REAL),
  CAST(COALESCE(json_extract(kv.value, '$.groupe.penalitePlafond'), 0) AS REAL),
  json_extract(kv.value, '$.groupe.moyensPaiement'),
  CAST(COALESCE(json_extract(kv.value, '$.groupe.membresMin'), 0) AS INTEGER),
  CAST(COALESCE(json_extract(kv.value, '$.groupe.membresMax'), 0) AS INTEGER),
  CASE WHEN json_extract(kv.value, '$.groupe.statut') = 'terminee' THEN 'terminee' ELSE 'active' END,
  json_extract(kv.value, '$.groupe.dateDebut'),
  json_extract(kv.value, '$.groupe.dateCreation'),
  json_extract(kv.value, '$.groupe.receptionMM')
FROM kv
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%')
  AND json_extract(kv.value, '$.groupe') IS NOT NULL;

-- ── 2) Membres ────────────────────────────────────────────────────
INSERT OR IGNORE INTO membres (id, groupe_id, nom, telephone, email, uid, role, bloque, date_adhesion, date_creation)
SELECT
  CAST(json_extract(m.value, '$.id') AS INTEGER),
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_extract(m.value, '$.nom'),
  json_extract(m.value, '$.telephone'),
  json_extract(m.value, '$.email'),
  json_extract(m.value, '$.uid'),
  json_extract(m.value, '$.role'),
  CASE WHEN json_extract(m.value, '$.bloque') = 1 THEN 1 ELSE 0 END,
  json_extract(m.value, '$.dateAdhesion'),
  json_extract(m.value, '$.dateCreation')
FROM kv
JOIN json_each(kv.value, '$.membres') AS m
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 3) Tours ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO tours (id, groupe_id, numero, membre_id, date_prevue, montant_pot, statut, date_reception)
SELECT
  CAST(json_extract(t.value, '$.id') AS INTEGER),
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  CAST(COALESCE(json_extract(t.value, '$.numero'), 0) AS INTEGER),
  CAST(json_extract(t.value, '$.membreId') AS INTEGER),
  json_extract(t.value, '$.datePrevue'),
  CAST(COALESCE(json_extract(t.value, '$.montantPot'), 0) AS REAL),
  COALESCE(json_extract(t.value, '$.statut'), 'en_attente'),
  json_extract(t.value, '$.dateReception')
FROM kv
JOIN json_each(kv.value, '$.tours') AS t
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 4) Cotisations ───────────────────────────────────────────────
INSERT OR IGNORE INTO cotisations (id, groupe_id, tour_id, membre_id, montant, date_paiement, statut, penalite, moyen_paiement, mode_operateur, mode_numero, mode_reference)
SELECT
  CAST(json_extract(c.value, '$.id') AS INTEGER),
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  CAST(json_extract(c.value, '$.tourId') AS INTEGER),
  CAST(json_extract(c.value, '$.membreId') AS INTEGER),
  CAST(COALESCE(json_extract(c.value, '$.montant'), 0) AS REAL),
  json_extract(c.value, '$.datePaiement'),
  COALESCE(json_extract(c.value, '$.statut'), 'en_attente'),
  CAST(COALESCE(json_extract(c.value, '$.penalite'), 0) AS REAL),
  json_extract(c.value, '$.moyenPaiement'),
  json_extract(c.value, '$.modeOperateur'),
  json_extract(c.value, '$.modeNumero'),
  json_extract(c.value, '$.modeReference')
FROM kv
JOIN json_each(kv.value, '$.cotisations') AS c
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 5) Prêts ────────────────────────────────────────────────────
INSERT OR IGNORE INTO prets (id, groupe_id, emprunteur_id, montant, taux_interet, date_echeance, date_creation, note, statut, remboursements)
SELECT
  CAST(json_extract(p.value, '$.id') AS INTEGER),
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  CAST(json_extract(p.value, '$.emprunteurId') AS INTEGER),
  CAST(COALESCE(json_extract(p.value, '$.montant'), 0) AS REAL),
  CAST(COALESCE(json_extract(p.value, '$.tauxInteret'), 0) AS REAL),
  json_extract(p.value, '$.dateEcheance'),
  json_extract(p.value, '$.dateCreation'),
  json_extract(p.value, '$.note'),
  COALESCE(json_extract(p.value, '$.statut'), 'en_cours'),
  COALESCE(json_extract(p.value, '$.remboursements'), '[]')
FROM kv
JOIN json_each(kv.value, '$.prets') AS p
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 6) Messages de discussion ───────────────────────────────────
INSERT OR IGNORE INTO groupe_messages (groupe_id, auteur, uid, email, texte, date, en_attente)
SELECT
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_extract(msg.value, '$.auteur'),
  json_extract(msg.value, '$.uid'),
  json_extract(msg.value, '$.email'),
  json_extract(msg.value, '$.texte'),
  json_extract(msg.value, '$.date'),
  CASE WHEN json_extract(msg.value, '$.enAttente') = 1 THEN 1 ELSE 0 END
FROM kv
JOIN json_each(kv.value, '$.groupe.messages') AS msg
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%')
  AND json_extract(msg.value, '$.texte') IS NOT NULL;

-- ── 7) Annonces ─────────────────────────────────────────────────
INSERT OR IGNORE INTO groupe_annonces (groupe_id, auteur, texte, date)
SELECT
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_extract(a.value, '$.auteur'),
  json_extract(a.value, '$.texte'),
  json_extract(a.value, '$.date')
FROM kv
JOIN json_each(kv.value, '$.groupe.annonces') AS a
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%')
  AND json_extract(a.value, '$.texte') IS NOT NULL;

-- ── 8) Journal d'activité ───────────────────────────────────────
INSERT OR IGNORE INTO groupe_journal (groupe_id, action, libelle, date)
SELECT
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_extract(j.value, '$.action'),
  json_extract(j.value, '$.libelle'),
  json_extract(j.value, '$.date')
FROM kv
JOIN json_each(kv.value, '$.groupe.journal') AS j
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 9) Ordre de passage tiré au sort ────────────────────────────
INSERT OR IGNORE INTO groupe_ordre_tire (groupe_id, position, membre_id)
SELECT
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  CAST(json_each.key AS INTEGER),
  CAST(json_each.value AS INTEGER)
FROM kv
JOIN json_each(kv.value, '$.groupe.ordreTire') AS json_each
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 10) Co-gérants ──────────────────────────────────────────────
INSERT OR IGNORE INTO groupe_co_gerants (groupe_id, uid, nom, email)
SELECT
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_each.key,
  json_extract(json_each.value, '$.nom'),
  json_extract(json_each.value, '$.email')
FROM kv
JOIN json_each(kv.value, '$.groupe.coGerants') AS json_each
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 11) Archives annuelles ──────────────────────────────────────
INSERT OR IGNORE INTO groupe_archives (groupe_id, annee, date_archive, total_cotis, total_penalites, total_recu, solde, nb_tours, nb_paiements, par_membre)
SELECT
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  CAST(json_extract(ar.value, '$.annee') AS INTEGER),
  json_extract(ar.value, '$.dateArchive'),
  CAST(COALESCE(json_extract(ar.value, '$.totalCotis'), 0) AS REAL),
  CAST(COALESCE(json_extract(ar.value, '$.totalPenalites'), 0) AS REAL),
  CAST(COALESCE(json_extract(ar.value, '$.totalRecu'), 0) AS REAL),
  CAST(COALESCE(json_extract(ar.value, '$.solde'), 0) AS REAL),
  CAST(COALESCE(json_extract(ar.value, '$.nbTours'), 0) AS INTEGER),
  CAST(COALESCE(json_extract(ar.value, '$.nbPaiements'), 0) AS INTEGER),
  json_extract(ar.value, '$.parMembre')
FROM kv
JOIN json_each(kv.value, '$.groupe.archives') AS ar
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%');

-- ── 12) Signalements de paiement (membre -> responsable) ────────
INSERT OR IGNORE INTO pending_paiements (id, groupe_id, nom, montant, operateur, numero_emetteur, reference, tour_id, tour_numero, membre_id, date, en_attente)
SELECT
  json_extract(pp.value, '$.id'),
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_extract(pp.value, '$.nom'),
  CAST(COALESCE(json_extract(pp.value, '$.montant'), 0) AS REAL),
  json_extract(pp.value, '$.operateur'),
  json_extract(pp.value, '$.numeroEmetteur'),
  json_extract(pp.value, '$.reference'),
  CAST(json_extract(pp.value, '$.tourId') AS INTEGER),
  CAST(json_extract(pp.value, '$.tourNumero') AS INTEGER),
  CAST(json_extract(pp.value, '$.membreId') AS INTEGER),
  json_extract(pp.value, '$.date'),
  CASE WHEN json_extract(pp.value, '$.enAttente') = 0 THEN 0 ELSE 1 END
FROM kv
JOIN json_each(kv.value, '$.groupe.pendingPaiements') AS pp
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%')
  AND json_extract(pp.value, '$.id') IS NOT NULL;

-- ── 13) Messages invités en attente ─────────────────────────────
INSERT OR IGNORE INTO pending_messages (id, groupe_id, texte, auteur, uid, email, date, en_attente)
SELECT
  json_extract(pm.value, '$.id'),
  (SELECT g.id FROM groupes g
     WHERE g.code_unique = json_extract(kv.value, '$.groupe.codeUnique')
        OR (g.code_unique IS NULL AND g.sauvegarde_uid = json_extract(kv.value, '$.groupe.sauvegardeUid'))
     LIMIT 1),
  json_extract(pm.value, '$.texte'),
  json_extract(pm.value, '$.auteur'),
  json_extract(pm.value, '$.uid'),
  json_extract(pm.value, '$.email'),
  json_extract(pm.value, '$.date'),
  CASE WHEN json_extract(pm.value, '$.enAttente') = 0 THEN 0 ELSE 1 END
FROM kv
JOIN json_each(kv.value, '$.groupe.pendingMessages') AS pm
WHERE (kv.key LIKE 'users/%/tontines/%' OR kv.key LIKE 'users/%/sauvegardes/%')
  AND json_extract(pm.value, '$.id') IS NOT NULL;

-- ── 14) Utilisateurs (comptes) ──────────────────────────────────
INSERT OR IGNORE INTO users (email, uid, display_name, auth_provider, password_salt, password_hash)
SELECT
  json_extract(kv.value, '$.email'),
  json_extract(kv.value, '$.uid'),
  json_extract(kv.value, '$.displayName'),
  CASE WHEN json_extract(kv.value, '$.google') = 1 THEN 'google' ELSE 'email' END,
  json_extract(kv.value, '$.salt'),
  json_extract(kv.value, '$.hash')
FROM kv
WHERE kv.key LIKE 'users/%'
  AND kv.key NOT LIKE 'users/%/%';   -- uniquement users/<email> (pas les sous-chemins)

-- ── 15) Jetons de réinitialisation ─────────────────────────────
INSERT OR IGNORE INTO password_resets (email, token, expires_at)
SELECT
  json_extract(kv.value, '$.email'),
  json_extract(kv.value, '$.token'),
  CAST(json_extract(kv.value, '$.exp') AS INTEGER)
FROM kv
WHERE kv.key LIKE 'auth/reset/%';

-- ── 16) Paiements en ligne confirmés (webhooks) ─────────────────
INSERT OR IGNORE INTO paiements_en_ligne (code, transaction_id, tour_id, membre_id, montant, operateur, numero, reference, statut, date)
SELECT
  substr(kv.key, 11, instr(substr(kv.key, 11), '/') - 1),
  json_extract(kv.value, '$.transactionId'),
  CAST(json_extract(kv.value, '$.tourId') AS INTEGER),
  CAST(json_extract(kv.value, '$.membreId') AS INTEGER),
  CAST(COALESCE(json_extract(kv.value, '$.montant'), 0) AS REAL),
  json_extract(kv.value, '$.operateur'),
  json_extract(kv.value, '$.numero'),
  json_extract(kv.value, '$.reference'),
  COALESCE(json_extract(kv.value, '$.statut'), 'paye'),
  json_extract(kv.value, '$.date')
FROM kv
WHERE kv.key LIKE 'paiements/%';

-- ── 17) Demandes d'inscription ─────────────────────────────────
INSERT OR IGNORE INTO demandes (id, code, nom, telephone, email, uid, maj_le)
SELECT
  json_extract(kv.value, '$.id'),
  substr(kv.key, 10, instr(substr(kv.key, 10), '/') - 1),
  json_extract(kv.value, '$.nom'),
  json_extract(kv.value, '$.telephone'),
  json_extract(kv.value, '$.email'),
  json_extract(kv.value, '$.uid'),
  CAST(json_extract(kv.value, '$.majLe') AS INTEGER)
FROM kv
WHERE kv.key LIKE 'demandes/%'
  AND json_extract(kv.value, '$.nom') IS NOT NULL;
