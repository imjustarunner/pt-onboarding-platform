-- Additive context linkage fields for booking -> clinical note/billing integration

ALTER TABLE office_booking_requests
  ADD COLUMN client_id INT NULL AFTER requested_provider_id;

ALTER TABLE office_booking_requests
  ADD KEY idx_office_booking_requests_client_id (client_id);

ALTER TABLE office_events
  ADD COLUMN client_id INT NULL AFTER booked_provider_id,
  ADD COLUMN clinical_session_id BIGINT NULL AFTER client_id,
  ADD COLUMN note_context_id BIGINT NULL AFTER clinical_session_id,
  ADD COLUMN billing_context_id BIGINT NULL AFTER note_context_id;

ALTER TABLE office_events
  ADD KEY idx_office_events_client_id (client_id),
  ADD KEY idx_office_events_clinical_session_id (clinical_session_id),
  ADD KEY idx_office_events_note_context_id (note_context_id),
  ADD KEY idx_office_events_billing_context_id (billing_context_id);
