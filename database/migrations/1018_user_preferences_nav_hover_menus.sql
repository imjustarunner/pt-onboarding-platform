-- Migration 1018: let users disable hover-open for top nav / assistant menus
ALTER TABLE user_preferences
  ADD COLUMN nav_hover_menus_enabled TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 0, top-nav and Ask Assistant open on click only (not hover)';
