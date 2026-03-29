ALTER TABLE conversations
  ADD COLUMN avatar_url VARCHAR(500) NULL AFTER is_public;
