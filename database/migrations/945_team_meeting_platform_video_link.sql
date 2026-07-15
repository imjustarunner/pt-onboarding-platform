-- Migration 945: track whether TEAM_MEETING/HUDDLE includes in-app video join link
ALTER TABLE provider_schedule_events
  ADD COLUMN platform_video_link TINYINT(1) NULL DEFAULT NULL
  COMMENT '1 = include app video join link; 0 = no platform link; NULL = legacy (treat as linked when video configured)';
