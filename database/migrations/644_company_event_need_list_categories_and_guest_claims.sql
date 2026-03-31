-- Add categories and guest-claim support for company event potluck need list items.
-- This enables:
-- 1) Categorized items in admin setup
-- 2) Claiming an item during public RSVP for matched or unmatched registrants

ALTER TABLE company_event_need_list_items
  ADD COLUMN item_category VARCHAR(64) NULL AFTER item_name,
  ADD COLUMN claimed_by_guest_name VARCHAR(200) NULL AFTER claimed_by_user_id,
  ADD COLUMN claimed_by_guest_email VARCHAR(255) NULL AFTER claimed_by_guest_name;

