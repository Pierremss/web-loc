-- Adiciona coluna custom_image para permitir upload de imagem personalizada para jogos
ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_image VARCHAR(500) NULL AFTER background_image;
