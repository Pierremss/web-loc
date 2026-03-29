ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin;

CREATE TABLE IF NOT EXISTS verification_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_verification_codes_user (user_id),
  CONSTRAINT fk_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
