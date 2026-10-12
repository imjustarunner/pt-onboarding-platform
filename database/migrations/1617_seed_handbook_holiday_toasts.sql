-- One-time handbook office-closure toasts: remaining 2026 and calendar 2027.
-- Source: ITSCO, NLU, ISI holiday-scheduling-policy. Administrative offices only.
-- America/Denver; prior business-day reminders; no annual regeneration.
-- Weekend holidays: listed calendar dates (handbooks do not specify substitute weekdays).

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 13, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-10-12 06:00:00', '2026-10-13 06:00:00', 'published', 'handbook-office-holidays:2026-10-12:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Wednesday, November 11, 2026 for Veteran''s Day and will reopen on Thursday, November 12, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-10 07:00:00', '2026-11-11 07:00:00', 'published', 'handbook-office-holidays:2026-11-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Veteran''s Day and will reopen on Thursday, November 12, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-11 07:00:00', '2026-11-12 07:00:00', 'published', 'handbook-office-holidays:2026-11-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 26, 2026 for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 30, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-25 07:00:00', '2026-11-26 07:00:00', 'published', 'handbook-office-holidays:2026-11-26:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 30, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-26 07:00:00', '2026-11-30 07:00:00', 'published', 'handbook-office-holidays:2026-11-26:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, December 24, 2026 for Christmas Eve / Christmas Day and will reopen on Monday, December 28, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-23 07:00:00', '2026-12-24 07:00:00', 'published', 'handbook-office-holidays:2026-12-24:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Christmas Eve / Christmas Day and will reopen on Monday, December 28, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-24 07:00:00', '2026-12-28 07:00:00', 'published', 'handbook-office-holidays:2026-12-24:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, December 31, 2026 for New Year’s Eve / New Year''s Day and will reopen on Monday, January 4, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-30 07:00:00', '2026-12-31 07:00:00', 'published', 'handbook-office-holidays:2026-12-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for New Year’s Eve / New Year''s Day and will reopen on Monday, January 4, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-31 07:00:00', '2027-01-04 07:00:00', 'published', 'handbook-office-holidays:2026-12-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, January 18, 2027 for Martin Luther King, Jr. Day and will reopen on Tuesday, January 19, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-01-15 07:00:00', '2027-01-18 07:00:00', 'published', 'handbook-office-holidays:2027-01-18:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Martin Luther King, Jr. Day and will reopen on Tuesday, January 19, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-01-18 07:00:00', '2027-01-19 07:00:00', 'published', 'handbook-office-holidays:2027-01-18:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, February 15, 2027 for President''s Day and will reopen on Tuesday, February 16, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-02-12 07:00:00', '2027-02-15 07:00:00', 'published', 'handbook-office-holidays:2027-02-15:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for President''s Day and will reopen on Tuesday, February 16, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-02-15 07:00:00', '2027-02-16 07:00:00', 'published', 'handbook-office-holidays:2027-02-15:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, May 31, 2027 for Memorial Day and will reopen on Tuesday, June 1, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-05-28 06:00:00', '2027-05-31 06:00:00', 'published', 'handbook-office-holidays:2027-05-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Memorial Day and will reopen on Tuesday, June 1, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-05-31 06:00:00', '2027-06-01 06:00:00', 'published', 'handbook-office-holidays:2027-05-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Saturday, June 19, 2027 for Juneteenth and will reopen on Monday, June 21, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-06-18 06:00:00', '2027-06-19 06:00:00', 'published', 'handbook-office-holidays:2027-06-19:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Juneteenth and will reopen on Monday, June 21, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-06-19 06:00:00', '2027-06-21 06:00:00', 'published', 'handbook-office-holidays:2027-06-19:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Sunday, July 4, 2027 for 4th of July/Independence Day and will reopen on Monday, July 5, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-07-02 06:00:00', '2027-07-04 06:00:00', 'published', 'handbook-office-holidays:2027-07-04:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for 4th of July/Independence Day and will reopen on Monday, July 5, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-07-04 06:00:00', '2027-07-05 06:00:00', 'published', 'handbook-office-holidays:2027-07-04:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, September 6, 2027 for Labor Day and will reopen on Tuesday, September 7, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-09-03 06:00:00', '2027-09-06 06:00:00', 'published', 'handbook-office-holidays:2027-09-06:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Labor Day and will reopen on Tuesday, September 7, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-09-06 06:00:00', '2027-09-07 06:00:00', 'published', 'handbook-office-holidays:2027-09-06:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, October 11, 2027 for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-10-08 06:00:00', '2027-10-11 06:00:00', 'published', 'handbook-office-holidays:2027-10-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-10-11 06:00:00', '2027-10-12 06:00:00', 'published', 'handbook-office-holidays:2027-10-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 11, 2027 for Veteran''s Day and will reopen on Friday, November 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-10 07:00:00', '2027-11-11 07:00:00', 'published', 'handbook-office-holidays:2027-11-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Veteran''s Day and will reopen on Friday, November 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-11 07:00:00', '2027-11-12 07:00:00', 'published', 'handbook-office-holidays:2027-11-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 25, 2027 for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 29, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-24 07:00:00', '2027-11-25 07:00:00', 'published', 'handbook-office-holidays:2027-11-25:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 29, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-25 07:00:00', '2027-11-29 07:00:00', 'published', 'handbook-office-holidays:2027-11-25:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Friday, December 24, 2027 for Christmas Eve / Christmas Day and will reopen on Monday, December 27, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-23 07:00:00', '2027-12-24 07:00:00', 'published', 'handbook-office-holidays:2027-12-24:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Christmas Eve / Christmas Day and will reopen on Monday, December 27, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-24 07:00:00', '2027-12-27 07:00:00', 'published', 'handbook-office-holidays:2027-12-24:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Friday, December 31, 2027 for New Year’s Eve / New Year''s Day and will reopen on Monday, January 3, 2028. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-30 07:00:00', '2027-12-31 07:00:00', 'published', 'handbook-office-holidays:2027-12-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for New Year’s Eve / New Year''s Day and will reopen on Monday, January 3, 2028. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-31 07:00:00', '2028-01-03 07:00:00', 'published', 'handbook-office-holidays:2027-12-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('itsco')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 13, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-10-12 06:00:00', '2026-10-13 06:00:00', 'published', 'handbook-office-holidays:2026-10-12:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Wednesday, November 11, 2026 for Veteran''s Day and will reopen on Thursday, November 12, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-10 07:00:00', '2026-11-11 07:00:00', 'published', 'handbook-office-holidays:2026-11-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Veteran''s Day and will reopen on Thursday, November 12, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-11 07:00:00', '2026-11-12 07:00:00', 'published', 'handbook-office-holidays:2026-11-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 26, 2026 for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 30, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-25 07:00:00', '2026-11-26 07:00:00', 'published', 'handbook-office-holidays:2026-11-26:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 30, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-26 07:00:00', '2026-11-30 07:00:00', 'published', 'handbook-office-holidays:2026-11-26:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, December 24, 2026 for Christmas Eve / Christmas Day and will reopen on Monday, December 28, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-23 07:00:00', '2026-12-24 07:00:00', 'published', 'handbook-office-holidays:2026-12-24:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Christmas Eve / Christmas Day and will reopen on Monday, December 28, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-24 07:00:00', '2026-12-28 07:00:00', 'published', 'handbook-office-holidays:2026-12-24:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, December 31, 2026 for New Year’s Eve / New Year''s Day and will reopen on Monday, January 4, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-30 07:00:00', '2026-12-31 07:00:00', 'published', 'handbook-office-holidays:2026-12-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for New Year’s Eve / New Year''s Day and will reopen on Monday, January 4, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-31 07:00:00', '2027-01-04 07:00:00', 'published', 'handbook-office-holidays:2026-12-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, January 18, 2027 for Martin Luther King, Jr. Day and will reopen on Tuesday, January 19, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-01-15 07:00:00', '2027-01-18 07:00:00', 'published', 'handbook-office-holidays:2027-01-18:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Martin Luther King, Jr. Day and will reopen on Tuesday, January 19, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-01-18 07:00:00', '2027-01-19 07:00:00', 'published', 'handbook-office-holidays:2027-01-18:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, February 15, 2027 for President''s Day and will reopen on Tuesday, February 16, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-02-12 07:00:00', '2027-02-15 07:00:00', 'published', 'handbook-office-holidays:2027-02-15:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for President''s Day and will reopen on Tuesday, February 16, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-02-15 07:00:00', '2027-02-16 07:00:00', 'published', 'handbook-office-holidays:2027-02-15:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, May 31, 2027 for Memorial Day and will reopen on Tuesday, June 1, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-05-28 06:00:00', '2027-05-31 06:00:00', 'published', 'handbook-office-holidays:2027-05-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Memorial Day and will reopen on Tuesday, June 1, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-05-31 06:00:00', '2027-06-01 06:00:00', 'published', 'handbook-office-holidays:2027-05-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Saturday, June 19, 2027 for Juneteenth and will reopen on Monday, June 21, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-06-18 06:00:00', '2027-06-19 06:00:00', 'published', 'handbook-office-holidays:2027-06-19:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Juneteenth and will reopen on Monday, June 21, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-06-19 06:00:00', '2027-06-21 06:00:00', 'published', 'handbook-office-holidays:2027-06-19:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Sunday, July 4, 2027 for 4th of July/Independence Day and will reopen on Monday, July 5, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-07-02 06:00:00', '2027-07-04 06:00:00', 'published', 'handbook-office-holidays:2027-07-04:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for 4th of July/Independence Day and will reopen on Monday, July 5, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-07-04 06:00:00', '2027-07-05 06:00:00', 'published', 'handbook-office-holidays:2027-07-04:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, September 6, 2027 for Labor Day and will reopen on Tuesday, September 7, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-09-03 06:00:00', '2027-09-06 06:00:00', 'published', 'handbook-office-holidays:2027-09-06:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Labor Day and will reopen on Tuesday, September 7, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-09-06 06:00:00', '2027-09-07 06:00:00', 'published', 'handbook-office-holidays:2027-09-06:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, October 11, 2027 for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-10-08 06:00:00', '2027-10-11 06:00:00', 'published', 'handbook-office-holidays:2027-10-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-10-11 06:00:00', '2027-10-12 06:00:00', 'published', 'handbook-office-holidays:2027-10-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 11, 2027 for Veteran''s Day and will reopen on Friday, November 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-10 07:00:00', '2027-11-11 07:00:00', 'published', 'handbook-office-holidays:2027-11-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Veteran''s Day and will reopen on Friday, November 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-11 07:00:00', '2027-11-12 07:00:00', 'published', 'handbook-office-holidays:2027-11-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 25, 2027 for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 29, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-24 07:00:00', '2027-11-25 07:00:00', 'published', 'handbook-office-holidays:2027-11-25:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 29, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-25 07:00:00', '2027-11-29 07:00:00', 'published', 'handbook-office-holidays:2027-11-25:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Friday, December 24, 2027 for Christmas Eve / Christmas Day and will reopen on Monday, December 27, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-23 07:00:00', '2027-12-24 07:00:00', 'published', 'handbook-office-holidays:2027-12-24:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Christmas Eve / Christmas Day and will reopen on Monday, December 27, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-24 07:00:00', '2027-12-27 07:00:00', 'published', 'handbook-office-holidays:2027-12-24:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Friday, December 31, 2027 for New Year’s Eve / New Year''s Day and will reopen on Monday, January 3, 2028. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-30 07:00:00', '2027-12-31 07:00:00', 'published', 'handbook-office-holidays:2027-12-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for New Year’s Eve / New Year''s Day and will reopen on Monday, January 3, 2028. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-31 07:00:00', '2028-01-03 07:00:00', 'published', 'handbook-office-holidays:2027-12-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 13, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-10-12 06:00:00', '2026-10-13 06:00:00', 'published', 'handbook-office-holidays:2026-10-12:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Wednesday, November 11, 2026 for Veteran''s Day and will reopen on Thursday, November 12, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-10 07:00:00', '2026-11-11 07:00:00', 'published', 'handbook-office-holidays:2026-11-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Veteran''s Day and will reopen on Thursday, November 12, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-11 07:00:00', '2026-11-12 07:00:00', 'published', 'handbook-office-holidays:2026-11-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 26, 2026 for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 30, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-25 07:00:00', '2026-11-26 07:00:00', 'published', 'handbook-office-holidays:2026-11-26:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 30, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-11-26 07:00:00', '2026-11-30 07:00:00', 'published', 'handbook-office-holidays:2026-11-26:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, December 24, 2026 for Christmas Eve / Christmas Day and will reopen on Monday, December 28, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-23 07:00:00', '2026-12-24 07:00:00', 'published', 'handbook-office-holidays:2026-12-24:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Christmas Eve / Christmas Day and will reopen on Monday, December 28, 2026. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-24 07:00:00', '2026-12-28 07:00:00', 'published', 'handbook-office-holidays:2026-12-24:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, December 31, 2026 for New Year’s Eve / New Year''s Day and will reopen on Monday, January 4, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-30 07:00:00', '2026-12-31 07:00:00', 'published', 'handbook-office-holidays:2026-12-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for New Year’s Eve / New Year''s Day and will reopen on Monday, January 4, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2026-12-31 07:00:00', '2027-01-04 07:00:00', 'published', 'handbook-office-holidays:2026-12-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, January 18, 2027 for Martin Luther King, Jr. Day and will reopen on Tuesday, January 19, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-01-15 07:00:00', '2027-01-18 07:00:00', 'published', 'handbook-office-holidays:2027-01-18:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Martin Luther King, Jr. Day and will reopen on Tuesday, January 19, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-01-18 07:00:00', '2027-01-19 07:00:00', 'published', 'handbook-office-holidays:2027-01-18:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, February 15, 2027 for President''s Day and will reopen on Tuesday, February 16, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-02-12 07:00:00', '2027-02-15 07:00:00', 'published', 'handbook-office-holidays:2027-02-15:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for President''s Day and will reopen on Tuesday, February 16, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-02-15 07:00:00', '2027-02-16 07:00:00', 'published', 'handbook-office-holidays:2027-02-15:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, May 31, 2027 for Memorial Day and will reopen on Tuesday, June 1, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-05-28 06:00:00', '2027-05-31 06:00:00', 'published', 'handbook-office-holidays:2027-05-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Memorial Day and will reopen on Tuesday, June 1, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-05-31 06:00:00', '2027-06-01 06:00:00', 'published', 'handbook-office-holidays:2027-05-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Saturday, June 19, 2027 for Juneteenth and will reopen on Monday, June 21, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-06-18 06:00:00', '2027-06-19 06:00:00', 'published', 'handbook-office-holidays:2027-06-19:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Juneteenth and will reopen on Monday, June 21, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-06-19 06:00:00', '2027-06-21 06:00:00', 'published', 'handbook-office-holidays:2027-06-19:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Sunday, July 4, 2027 for 4th of July/Independence Day and will reopen on Monday, July 5, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-07-02 06:00:00', '2027-07-04 06:00:00', 'published', 'handbook-office-holidays:2027-07-04:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for 4th of July/Independence Day and will reopen on Monday, July 5, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-07-04 06:00:00', '2027-07-05 06:00:00', 'published', 'handbook-office-holidays:2027-07-04:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, September 6, 2027 for Labor Day and will reopen on Tuesday, September 7, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-09-03 06:00:00', '2027-09-06 06:00:00', 'published', 'handbook-office-holidays:2027-09-06:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Labor Day and will reopen on Tuesday, September 7, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-09-06 06:00:00', '2027-09-07 06:00:00', 'published', 'handbook-office-holidays:2027-09-06:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Monday, October 11, 2027 for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-10-08 06:00:00', '2027-10-11 06:00:00', 'published', 'handbook-office-holidays:2027-10-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Indigenous People’s Day/Columbus Day and will reopen on Tuesday, October 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-10-11 06:00:00', '2027-10-12 06:00:00', 'published', 'handbook-office-holidays:2027-10-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 11, 2027 for Veteran''s Day and will reopen on Friday, November 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-10 07:00:00', '2027-11-11 07:00:00', 'published', 'handbook-office-holidays:2027-11-11:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Veteran''s Day and will reopen on Friday, November 12, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-11 07:00:00', '2027-11-12 07:00:00', 'published', 'handbook-office-holidays:2027-11-11:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Thursday, November 25, 2027 for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 29, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-24 07:00:00', '2027-11-25 07:00:00', 'published', 'handbook-office-holidays:2027-11-25:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Thanksgiving Day / Day after Thanksgiving and will reopen on Monday, November 29, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-11-25 07:00:00', '2027-11-29 07:00:00', 'published', 'handbook-office-holidays:2027-11-25:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Friday, December 24, 2027 for Christmas Eve / Christmas Day and will reopen on Monday, December 27, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-23 07:00:00', '2027-12-24 07:00:00', 'published', 'handbook-office-holidays:2027-12-24:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for Christmas Eve / Christmas Day and will reopen on Monday, December 27, 2027. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-24 07:00:00', '2027-12-27 07:00:00', 'published', 'handbook-office-holidays:2027-12-24:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Upcoming administrative office closure', 'Our administrative offices will be closed beginning Friday, December 31, 2027 for New Year’s Eve / New Year''s Day and will reopen on Monday, January 3, 2028. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-30 07:00:00', '2027-12-31 07:00:00', 'published', 'handbook-office-holidays:2027-12-31:reminder'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);

INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, 'Administrative offices closed today', 'Our administrative offices are closed today for New Year’s Eve / New Year''s Day and will reopen on Monday, January 3, 2028. This closure applies to administrative offices only; provider appointments and services follow their individual schedules.', 'toast', 'everyone', JSON_ARRAY(), '2027-12-31 07:00:00', '2028-01-03 07:00:00', 'published', 'handbook-office-holidays:2027-12-31:closed'
FROM agencies a WHERE LOWER(a.slug) IN ('tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute')
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);
