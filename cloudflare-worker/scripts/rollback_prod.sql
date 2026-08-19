-- =====================================================================
-- Rollback de la migration 0002/0003 sur tontine-db
-- Supprime UNIQUEMENT les tables relationnelles creees par 0002.
-- La table kv (source de verite des donnees) est CONSERVEE :
--   -> aucune perte de donnee, la migration est totalement reversible.
-- Ordre : tables filles (reference des FK) avant les parents.
-- Idempotent : DROP TABLE IF EXISTS.
-- =====================================================================

DROP TABLE IF EXISTS groupe_ordre_tire;
DROP TABLE IF EXISTS groupe_co_gerants;
DROP TABLE IF EXISTS groupe_archives;
DROP TABLE IF EXISTS groupe_messages;
DROP TABLE IF EXISTS groupe_annonces;
DROP TABLE IF EXISTS groupe_journal;
DROP TABLE IF EXISTS pending_paiements;
DROP TABLE IF EXISTS pending_messages;
DROP TABLE IF EXISTS demandes;
DROP TABLE IF EXISTS paiements_en_ligne;
DROP TABLE IF EXISTS cotisations;
DROP TABLE IF EXISTS tours;
DROP TABLE IF EXISTS prets;
DROP TABLE IF EXISTS membres;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS groupes;
