-- Migration 1093: Link imported billing encounters to clinical sessions (notes without calendar)

ALTER TABLE billing_encounters
  ADD COLUMN clinical_session_id BIGINT NULL
    COMMENT 'Clinical DB session for chart notes on this billed encounter',
  ADD KEY idx_be_clinical_session (clinical_session_id);
