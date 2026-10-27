-- Confirmed practice details for optional referral filters; unknown values stay null/empty.
ALTER TABLE referral_directory_entries ADD COLUMN matching_details JSON NULL;
