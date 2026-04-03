-- Club stats configuration: managers pick which stats to display and enter
-- historical seed values (pre-app data that is added to live workout totals).
-- stats_config_json stores an ordered array of stat objects.

ALTER TABLE agencies
  ADD COLUMN stats_config_json JSON NULL;
