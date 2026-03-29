ALTER TABLE game_recommendations
  MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending';

SET @OLD_SQL_SAFE_UPDATES = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

UPDATE game_recommendations
  SET status = 'accepted'
  WHERE status NOT IN ('pending', 'accepted', 'rejected');

SET SQL_SAFE_UPDATES = @OLD_SQL_SAFE_UPDATES;
