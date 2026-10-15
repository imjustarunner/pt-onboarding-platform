-- An ongoing weekly request deliberately has no occurrence limit.
-- Preserve NULL instead of forcing a finite count or rejecting the request.
-- Keep the one-time default and all existing request values unchanged.
ALTER TABLE provider_office_availability_requests
  MODIFY COLUMN requested_occurrence_count SMALLINT NULL DEFAULT 1;
