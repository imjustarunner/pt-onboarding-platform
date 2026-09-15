-- Kimi's website inquiries are currently handled by PlotTwistCo support.
-- Reuse the authorized sender address, without taking over its inbound routes.
INSERT INTO email_sender_identities (agency_id, identity_key, display_name, from_email, reply_to, is_active)
SELECT 432, 'support', h.display_name, h.from_email, h.reply_to, 1
FROM email_sender_identities h
WHERE h.agency_id = 1 AND h.identity_key = 'support' AND h.is_active = 1
  AND NOT EXISTS (SELECT 1 FROM email_sender_identities k WHERE k.agency_id = 432 AND k.identity_key = 'support')
LIMIT 1;
