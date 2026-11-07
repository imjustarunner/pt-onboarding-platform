-- A provider can select multiple service-focus categories (all 12 exceed 255 characters).
ALTER TABLE users MODIFY COLUMN service_focus TEXT NULL;
