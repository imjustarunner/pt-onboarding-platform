-- Migration: Add company car access flags to users

ALTER TABLE users
  ADD COLUMN company_car_submit_access TINYINT(1) NOT NULL DEFAULT 0 AFTER company_card_enabled,
  ADD COLUMN company_car_manage_access TINYINT(1) NOT NULL DEFAULT 0 AFTER company_car_submit_access;
