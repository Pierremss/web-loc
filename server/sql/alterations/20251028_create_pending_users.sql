CREATE TABLE IF NOT EXISTS pending_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  nickname VARCHAR(50),
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  platforms VARCHAR(100),
  game_style VARCHAR(20),
  available_times TEXT,
  profile TEXT,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pending_user_games (
  pending_user_id INT UNSIGNED NOT NULL,
  game_id INT NOT NULL,
  PRIMARY KEY (pending_user_id, game_id),
  CONSTRAINT fk_pug_pending_user FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pug_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET @db_name := DATABASE();

SET @has_pending_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'verification_codes'
    AND COLUMN_NAME = 'pending_user_id'
);
SET @sql := IF(@has_pending_column = 0,
  'ALTER TABLE verification_codes ADD COLUMN pending_user_id INT UNSIGNED NULL AFTER user_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @needs_nullable_user := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'verification_codes'
    AND COLUMN_NAME = 'user_id'
    AND IS_NULLABLE = 'NO'
);
SET @sql := IF(@needs_nullable_user > 0,
  'ALTER TABLE verification_codes MODIFY COLUMN user_id INT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_email_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'verification_codes'
    AND INDEX_NAME = 'idx_verification_codes_email'
);
SET @sql := IF(@has_email_index = 0,
  'ALTER TABLE verification_codes ADD KEY idx_verification_codes_email (email)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_pending_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'verification_codes'
    AND INDEX_NAME = 'idx_verification_codes_pending'
);
SET @sql := IF(@has_pending_index = 0,
  'ALTER TABLE verification_codes ADD KEY idx_verification_codes_pending (pending_user_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_pending_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db_name
    AND CONSTRAINT_NAME = 'fk_verification_codes_pending'
);
SET @sql := IF(@has_pending_fk = 0,
  'ALTER TABLE verification_codes ADD CONSTRAINT fk_verification_codes_pending FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
