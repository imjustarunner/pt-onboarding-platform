-- Migration: Add per-user toggle for company card expense submissions

ALTER TABLE users
  ADD COLUMN company_card_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER medcancel_rate_schedule;

