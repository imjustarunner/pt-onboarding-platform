-- Responses, respondent identity, and appointment snapshot remain encrypted.
-- An indexed appointment reference makes older appointment results retrievable
-- independently of the recent client-history window. Existing responses stay intact.
ALTER TABLE client_outcome_measure_responses ADD COLUMN appointment_id INT NULL;
CREATE INDEX idx_outcome_appointment ON client_outcome_measure_responses (client_id, agency_id, appointment_id, recorded_at, id);
