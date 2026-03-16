-- Club quick action icons (Add Member, Add Season, Settings) - customizable per club (affiliation)
ALTER TABLE agencies
  ADD COLUMN club_add_member_icon_id INT NULL,
  ADD COLUMN club_add_season_icon_id INT NULL,
  ADD COLUMN club_settings_icon_id INT NULL;
