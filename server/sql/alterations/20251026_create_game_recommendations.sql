-- Cria a tabela de recomendações de jogos enviadas pelos jogadores
CREATE TABLE IF NOT EXISTS game_recommendations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  game_name VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  genre VARCHAR(255) NOT NULL,
  game_type VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  admin_notes TEXT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_game_recommendations_status (status),
  KEY idx_game_recommendations_created_at (created_at),
  CONSTRAINT fk_game_recommendations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;