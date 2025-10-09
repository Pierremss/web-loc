-- Migração para popular tabelas platforms/game_platforms com dados existentes
-- Execute após atualizar o schema

START TRANSACTION;

-- 1. Garantir que as plataformas padrão existam na tabela nova
INSERT IGNORE INTO platforms (name) VALUES
  ('PlayStation'),
  ('Xbox'),
  ('Nintendo'),
  ('PC'),
  ('Mobile');

-- 2. Inserir plataformas inexistentes vindas do campo antigo (CSV ou SET)
INSERT IGNORE INTO platforms (name)
SELECT DISTINCT TRIM(p)
FROM (
  SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(g.platforms, ',', numbers.n), ',', -1) AS p
  FROM games g
  JOIN (
    SELECT a.N + b.N * 10 + 1 AS n
    FROM (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
  ) numbers
  WHERE numbers.n <= 1 + LENGTH(g.platforms) - LENGTH(REPLACE(g.platforms, ',', ''))
) AS derived
WHERE p IS NOT NULL AND p <> '';

-- 3. Preencher tabela pivot com dados existentes
INSERT IGNORE INTO game_platforms (game_id, platform_id)
SELECT g.id, p.id
FROM games g
JOIN (
  SELECT id AS game_id,
         TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(platforms, ',', numbers.n), ',', -1)) AS platform_name
  FROM games
  JOIN (
    SELECT a.N + b.N * 10 + 1 AS n
    FROM (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
  ) numbers
  WHERE numbers.n <= 1 + LENGTH(platforms) - LENGTH(REPLACE(platforms, ',', ''))
) parsed ON parsed.game_id = g.id
JOIN platforms p ON p.name = parsed.platform_name
WHERE g.platforms IS NOT NULL AND g.platforms <> '';

COMMIT;
