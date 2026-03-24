-- Public Skill Builders registration page: hero image, extra copy, in-person venue + geocode cache

ALTER TABLE company_events
  ADD COLUMN public_hero_image_url VARCHAR(2048) NULL DEFAULT NULL
    COMMENT 'Image URL for public /open-events listing cards' AFTER splash_content,
  ADD COLUMN public_listing_details TEXT NULL DEFAULT NULL
    COMMENT 'Additional plain-text details for public registration page' AFTER public_hero_image_url,
  ADD COLUMN in_person_public TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, show venue address on public listing' AFTER public_listing_details,
  ADD COLUMN public_location_address TEXT NULL DEFAULT NULL
    COMMENT 'Full street address for in-person events (geocoded for nearest search)' AFTER in_person_public,
  ADD COLUMN public_location_lat DECIMAL(10, 7) NULL DEFAULT NULL
    COMMENT 'Cached latitude from geocoding public_location_address' AFTER public_location_address,
  ADD COLUMN public_location_lng DECIMAL(10, 7) NULL DEFAULT NULL
    COMMENT 'Cached longitude from geocoding public_location_address' AFTER public_location_lat;
