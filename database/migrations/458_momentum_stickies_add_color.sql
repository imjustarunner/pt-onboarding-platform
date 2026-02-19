-- Add color to momentum stickies (preset names: yellow, pink, blue, green, purple, orange)
ALTER TABLE momentum_stickies
  ADD COLUMN color VARCHAR(20) NULL DEFAULT 'yellow' AFTER sort_order;
