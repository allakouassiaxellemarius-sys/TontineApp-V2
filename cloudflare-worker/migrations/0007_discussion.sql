-- 0007_discussion.sql — discussion conforme à une vraie messagerie
--
-- Le miroir relationnel régénérait l'id de chaque message à chaque publication
-- (`groupe_messages` n'avait pas de colonne id applicative) : aucune référence
-- inter-clients n'était possible. `cle` est l'identifiant posé par l'appareil
-- qui crée le message ; il ne change jamais, et c'est lui que pointent les
-- réponses, les épingles et les accusés de lecture.

ALTER TABLE groupe_messages ADD COLUMN cle TEXT;
ALTER TABLE groupe_messages ADD COLUMN repondre_a TEXT;
ALTER TABLE groupe_messages ADD COLUMN media TEXT;
ALTER TABLE groupe_messages ADD COLUMN epingle INTEGER NOT NULL DEFAULT 0;
ALTER TABLE groupe_messages ADD COLUMN modifie_le TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_groupe_cle ON groupe_messages(groupe_id, cle) WHERE cle IS NOT NULL;

-- Les messages d'invité portent déjà un id applicatif ('inv-…') conservé de
-- bout en bout : pas de `cle` ici, seulement les nouveaux champs.
ALTER TABLE pending_messages ADD COLUMN repondre_a TEXT;
ALTER TABLE pending_messages ADD COLUMN media TEXT;
ALTER TABLE pending_messages ADD COLUMN modifie_le TEXT;
