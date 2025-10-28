ALTER TABLE game_recommendations
  ADD COLUMN created_game_id INT UNSIGNED NULL AFTER resolved_at,
  ADD CONSTRAINT fk_game_recommendations_created_game
    FOREIGN KEY (created_game_id) REFERENCES games(id)
    ON DELETE SET NULL;
