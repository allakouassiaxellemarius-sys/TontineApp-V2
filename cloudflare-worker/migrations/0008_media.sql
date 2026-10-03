-- 0008_media.sql — photos de la discussion
--
-- R2 demande une activation manuelle dans le tableau de bord Cloudflare (erreur
-- API 10042) : les images vivent donc dans D1, en base64, une ligne par média.
-- C'est ce qui permet de les sortir du blob du groupe (le seul endroit où elles
-- ne peuvent pas rester : chaque message ferait republier des centaines de
-- kilo-octets à tous les appareils) sans configuration supplémentaire.
CREATE TABLE IF NOT EXISTS media (
  code     TEXT NOT NULL,
  id       TEXT NOT NULL,
  type     TEXT NOT NULL,
  data     TEXT NOT NULL,
  par      TEXT,
  le       TEXT,
  PRIMARY KEY (code, id)
);
CREATE INDEX IF NOT EXISTS idx_media_code ON media(code);
