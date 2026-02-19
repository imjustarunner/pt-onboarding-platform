-- Add is_hidden for hide/restore (soft hide) - stickies can be hidden and brought back
ALTER TABLE momentum_stickies
  ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE AFTER color;
