-- Migration 1393: wire ITSCO secure_message sender identity to signature PNG
UPDATE email_sender_identities
SET
  signature_image_url = '/email-signatures/itsco-secure-message.png',
  signature_image_path = '/email-signatures/itsco-secure-message.png'
WHERE agency_id = 2
  AND identity_key = 'secure_message'
  AND (signature_image_url IS NULL OR signature_image_url = '' OR signature_image_path IS NULL OR signature_image_path = '');
