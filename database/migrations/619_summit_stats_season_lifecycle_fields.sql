-- Summit Stats Challenge seasonal workflow foundation.
-- Adds lifecycle and season-settings fields to learning_program_classes.

ALTER TABLE learning_program_classes
  ADD COLUMN captain_application_open TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'When true, members can apply to be captain/team lead for the season'
    AFTER recognition_metric,
  ADD COLUMN captains_finalized TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Set true by manager when captains are finalized for season'
    AFTER captain_application_open,
  ADD COLUMN season_splash_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Controls whether season splash CTA is shown in SSC dashboard'
    AFTER captains_finalized,
  ADD COLUMN season_announcement_text TEXT NULL
    COMMENT 'Optional message shown on season splash / launch notice'
    AFTER season_splash_enabled,
  ADD COLUMN season_settings_json JSON NULL
    COMMENT 'Custom season settings payload (feed options, moderation, additional parameters)'
    AFTER season_announcement_text;
