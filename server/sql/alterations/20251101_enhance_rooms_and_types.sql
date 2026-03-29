-- Ajustes para suportar múltiplos tipos de jogo por usuário e novos recursos de salas

ALTER TABLE users
  MODIFY COLUMN game_style VARCHAR(80) NULL;

ALTER TABLE pending_users
  MODIFY COLUMN game_style VARCHAR(80) NULL;

ALTER TABLE rooms
  ADD COLUMN avatar_url VARCHAR(500) NULL AFTER description;

CREATE TABLE IF NOT EXISTS room_members (
  room_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
  added_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  KEY idx_room_members_user (user_id),
  CONSTRAINT fk_room_members_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_members_added FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_types (
  user_id INT NOT NULL,
  type_id INT NOT NULL,
  PRIMARY KEY (user_id, type_id),
  CONSTRAINT fk_user_types_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_types_type FOREIGN KEY (type_id) REFERENCES game_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pending_user_types (
  pending_user_id INT UNSIGNED NOT NULL,
  type_id INT NOT NULL,
  PRIMARY KEY (pending_user_id, type_id),
  CONSTRAINT fk_pending_user_types_pending FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pending_user_types_type FOREIGN KEY (type_id) REFERENCES game_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO room_members (room_id, user_id, role, added_by)
SELECT id, owner_id, 'owner', owner_id
FROM rooms;
