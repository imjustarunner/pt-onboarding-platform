-- Explicit staff availability survives app backgrounding. No visitor presence is extended.
ALTER TABLE public_website_chat_staff
 ADD COLUMN mobile_device_session_id BIGINT UNSIGNED NULL,
 ADD INDEX ix_website_chat_mobile_device (mobile_device_session_id);
