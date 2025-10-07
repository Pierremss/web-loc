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
  platforms VARCHAR(100),
  game_style VARCHAR(20),
  available_times TEXT,
  profile TEXT,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Garante que os campos existam mesmo em bancos antigos

CREATE TABLE IF NOT EXISTS games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  platforms SET('PlayStation','Xbox','Nintendo','PC') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_games (
  user_id INT NOT NULL,
  game_id INT NOT NULL,
  PRIMARY KEY (user_id, game_id),
  CONSTRAINT fk_ug_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ug_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
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