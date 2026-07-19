-- Migration 995: Allowed Place of Service (POS) list per medical service code
-- Used when booking mental-health sessions to filter location options by code.

ALTER TABLE agency_medical_service_codes
  ADD COLUMN allowed_place_of_service_json JSON NULL
  COMMENT 'CMS POS codes this service may be offered at, e.g. ["02","11","03"]. Null = no restriction';
