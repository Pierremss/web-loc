-- Cria tabelas genres, game_genres, game_types e game_game_types
CREATE TABLE IF NOT EXISTS genres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_genres (
  game_id INT NOT NULL,
  genre_id INT NOT NULL,
  PRIMARY KEY (game_id, genre_id),
  CONSTRAINT fk_gg_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gg_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_game_types (
  game_id INT NOT NULL,
  type_id INT NOT NULL,
  PRIMARY KEY (game_id, type_id),
  CONSTRAINT fk_gt_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gt_type FOREIGN KEY (type_id) REFERENCES game_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Exemplo de populaçao inicial (opcional)
INSERT IGNORE INTO game_types (name) VALUES ('Competitivo'), ('Casual');
INSERT IGNORE INTO genres (name) VALUES ('FPS'), ('RPG'), ('MOBA'), ('Aventura'), ('Racing');
