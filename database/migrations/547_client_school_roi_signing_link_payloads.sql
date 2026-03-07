-- Persist smart school ROI context, signer decisions, and access application metadata.

ALTER TABLE client_school_roi_signing_links
  ADD COLUMN roi_context_json JSON NULL AFTER completed_client_phi_document_id,
  ADD COLUMN roi_response_json JSON NULL AFTER roi_context_json,
  ADD COLUMN access_applied_at DATETIME NULL AFTER roi_response_json;
