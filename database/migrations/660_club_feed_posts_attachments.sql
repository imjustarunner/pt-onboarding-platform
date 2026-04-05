-- Rich club feed posts: optional image attachments (paths under uploads/club_feed/...)

ALTER TABLE club_feed_posts
  ADD COLUMN attachments_json JSON NULL COMMENT 'Array of {type, path, mime}' AFTER message_text;
