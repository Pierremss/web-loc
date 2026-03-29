-- MySQL schema for WebLoc
CREATE DATABASE IF NOT EXISTS webloc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webloc;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  nickname VARCHAR(50),
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  banned_until DATETIME NULL,
  platforms VARCHAR(100),
  game_style VARCHAR(80),
  available_times TEXT,
  profile TEXT,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Eventos/notificações de conta (ban, unban, exclusão)
CREATE TABLE IF NOT EXISTS user_account_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  type VARCHAR(32) NOT NULL,
  message VARCHAR(500) NOT NULL,
  meta JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uae_user (user_id),
  INDEX idx_uae_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pending_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  nickname VARCHAR(50),
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  platforms VARCHAR(100),
  game_style VARCHAR(80),
  profile TEXT,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;


-- =============================================
-- Group conversations (salas) schema
-- Keeps existing direct messages intact; groups use separate tables
-- =============================================

CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NULL,
  description TEXT NULL,
  owner_id INT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_owner (owner_id),
  CONSTRAINT fk_conv_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  role ENUM('member','admin','owner') NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_read_message_id BIGINT UNSIGNED NULL,
  notifications ENUM('all','mentions','none') NOT NULL DEFAULT 'all',
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_user_convs (user_id),
  KEY idx_conv_last_read (conversation_id, last_read_message_id),
  CONSTRAINT fk_cm_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  reply_to_id BIGINT UNSIGNED NULL,
  KEY idx_conv_time (conversation_id, created_at),
  KEY idx_sender_time (sender_id, created_at),
  CONSTRAINT fk_cmsg_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmsg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmsg_reply_to FOREIGN KEY (reply_to_id) REFERENCES conversation_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_message_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cma_message FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT fk_cmr_message FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_invites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  inviter_id INT NOT NULL,
  invitee_id INT NULL,
  token CHAR(22) NOT NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_token (token),
  KEY idx_invitee (invitee_id),
  CONSTRAINT fk_ci_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_invitee FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  link VARCHAR(500) NULL,
  description TEXT NULL,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rooms_owner (owner_id),
  CONSTRAINT fk_rooms_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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

-- Garante que os campos existam mesmo em bancos antigos

CREATE TABLE IF NOT EXISTS platforms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  rawg_id INT UNSIGNED NULL UNIQUE,
  slug VARCHAR(160) NULL,
  description TEXT NULL,
  released DATE NULL,
  background_image VARCHAR(500) NULL,
  rating DECIMAL(4,1) NULL,
  ratings_count INT UNSIGNED NULL,
  metacritic INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_games_slug (slug),
  KEY idx_games_released (released)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS game_platforms (
  game_id INT NOT NULL,
  platform_id INT NOT NULL,
  PRIMARY KEY (game_id, platform_id),
  CONSTRAINT fk_gp_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gp_platform FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO platforms (name) VALUES
  ('PlayStation'),
  ('Xbox'),
  ('Nintendo'),
  ('PC'),
  ('Mobile');

CREATE TABLE IF NOT EXISTS user_games (
  user_id INT NOT NULL,
  game_id INT NOT NULL,
  PRIMARY KEY (user_id, game_id),
  CONSTRAINT fk_ug_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ug_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pending_user_games (
  pending_user_id INT UNSIGNED NOT NULL,
  game_id INT NOT NULL,
  PRIMARY KEY (pending_user_id, game_id),
  CONSTRAINT fk_pug_pending_user FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pug_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_types (
  user_id INT NOT NULL,
  type_id INT NOT NULL,
  PRIMARY KEY (user_id, type_id),
  CONSTRAINT fk_ut_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ut_type FOREIGN KEY (type_id) REFERENCES game_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_genres (
  user_id INT NOT NULL,
  genre_id INT NOT NULL,
  PRIMARY KEY (user_id, genre_id),
  CONSTRAINT fk_ugr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ugr_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pending_user_types (
  pending_user_id INT UNSIGNED NOT NULL,
  type_id INT NOT NULL,
  PRIMARY KEY (pending_user_id, type_id),
  CONSTRAINT fk_put_pending_user FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_put_type FOREIGN KEY (type_id) REFERENCES game_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pending_user_genres (
  pending_user_id INT UNSIGNED NOT NULL,
  genre_id INT NOT NULL,
  PRIMARY KEY (pending_user_id, genre_id),
  CONSTRAINT fk_pugr_pending_user FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pugr_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS verification_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  pending_user_id INT UNSIGNED NULL,
  email VARCHAR(255) NOT NULL,
  code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_verification_codes_user (user_id),
  KEY idx_verification_codes_pending (pending_user_id),
  KEY idx_verification_codes_email (email),
  CONSTRAINT fk_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_verification_codes_pending FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_password_reset_user (user_id),
  KEY idx_password_reset_email (email),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
  created_game_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_game_recommendations_status (status),
  KEY idx_game_recommendations_created_at (created_at),
  CONSTRAINT fk_game_recommendations_created_game FOREIGN KEY (created_game_id) REFERENCES games(id) ON DELETE SET NULL,
  CONSTRAINT fk_game_recommendations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Social: pedidos de amizade, amizades e mensagens
CREATE TABLE IF NOT EXISTS friend_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  receiver_id INT NOT NULL,
  status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_request (requester_id, receiver_id),
  KEY idx_receiver (receiver_id),
  CONSTRAINT fk_fr_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS friendships (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  friend_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Par não-direcional: evita duplicar (A,B) e (B,A)
  user_min INT GENERATED ALWAYS AS (LEAST(user_id, friend_id)) STORED,
  user_max INT GENERATED ALWAYS AS (GREATEST(user_id, friend_id)) STORED,
  UNIQUE KEY uniq_pair_unordered (user_min, user_max),
  KEY idx_user (user_id),
  CONSTRAINT fk_fs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fs_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  edited_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  reply_to_id BIGINT UNSIGNED NULL,
  KEY idx_pair_time (sender_id, receiver_id, created_at),
  KEY idx_receiver_time (receiver_id, created_at),
  KEY idx_receiver_read (receiver_id, read_at),
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_reply_to FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Mensagens apagadas por um usuário (visibilidade local), sem apagar do outro lado
CREATE TABLE IF NOT EXISTS message_deletions (
  user_id INT NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, message_id),
  KEY idx_md_user (user_id),
  KEY idx_md_message (message_id)
) ENGINE=InnoDB;

-- Anexos e reações para mensagens diretas
CREATE TABLE IF NOT EXISTS message_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ma_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT fk_mr_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Bloqueio entre usuários
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT fk_ub_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ub_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Denúncias de usuários
CREATE TABLE IF NOT EXISTS user_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT NOT NULL,
  reported_id INT NOT NULL,
  context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
  reason VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_reports_reporter (reporter_id),
  INDEX idx_user_reports_reported (reported_id),
  CONSTRAINT fk_ur_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_reported FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE pending_users
  ADD COLUMN available_times TEXT NULL AFTER game_style;