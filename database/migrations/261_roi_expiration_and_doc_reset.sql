-- Migration: ROI expiration + documentation reset support
-- Description:
-- 1) Add roi_expires_at to clients so ROI can expire per client.
-- 2) Add roi_expires_at to client_paperwork_history so expiration can be recorded alongside status updates.

ALTER TABLE clients
  ADD COLUMN roi_expires_at DATE NULL AFTER doc_date,
  ADD INDEX idx_clients_roi_expires_at (roi_expires_at);

ALTER TABLE client_paperwork_history
  ADD COLUMN roi_expires_at DATE NULL AFTER effective_date,
  ADD INDEX idx_client_paperwork_roi_expires (client_id, roi_expires_at);

