-- Add intake_steps JSON to intake_links for ordered intake flow builder
ALTER TABLE intake_links
  ADD COLUMN intake_steps JSON NULL;
