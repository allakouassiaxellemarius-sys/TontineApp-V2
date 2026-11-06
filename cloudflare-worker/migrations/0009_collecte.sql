-- Migration 0009 — compte de collecte Pi-Spi
-- Le client stocke le lien payable dans group.collecte ({type,nom,compte,titulaire})
-- depuis 58e7e6e, mais le miroir relationnel n'avait pas de colonne pour lui :
-- syncGroupSnapshot l'ignorait et buildSnapshotFromRelational ne le rendait pas,
-- donc tout payeur recevait « Aucun compte configuré ».
-- La valeur est du JSON borné côté serveur (schéma + taille), pas une URL brute.
ALTER TABLE groupes ADD COLUMN collecte TEXT;
