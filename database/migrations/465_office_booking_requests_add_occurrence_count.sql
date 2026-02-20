-- Add optional occurrence count for recurring office booking requests.
-- When populated (e.g. 6), the approved booking plan will cap at that many occurrences.

ALTER TABLE office_booking_requests
  ADD COLUMN booked_occurrence_count INT NULL AFTER recurrence;
