-- Adiciona coluna created_at na tabela user_games para permitir ordenação por favoritos recentes
ALTER TABLE user_games 
ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER game_id;

-- Atualiza os registros existentes com timestamps fictícios (ordem atual)
-- Os novos registros já terão timestamp automático
UPDATE user_games 
SET created_at = NOW() 
WHERE created_at IS NULL;
