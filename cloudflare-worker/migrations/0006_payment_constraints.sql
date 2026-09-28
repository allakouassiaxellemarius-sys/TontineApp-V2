-- Migration 0006 — contraintes d'idempotence des paiements en ligne
-- Le Worker utilise ON CONFLICT(transaction_id) pour les webhooks
-- Flutterwave. La contrainte doit donc exister côté D1.

-- Conserve la première occurrence si une ancienne version a écrit un
-- même transaction_id plusieurs fois avant l'ajout de la contrainte.
DELETE FROM paiements_en_ligne
WHERE transaction_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM paiements_en_ligne
    WHERE transaction_id IS NOT NULL
    GROUP BY transaction_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_paiements_transaction
  ON paiements_en_ligne(transaction_id);
