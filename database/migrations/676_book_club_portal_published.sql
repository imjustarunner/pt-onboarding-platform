-- Reader-facing portal visibility: tenant feature flag (bookClubEnabled) gates management;
-- this flag gates the public /{portal}/bookclub page after admins finish setup.
ALTER TABLE agencies
  ADD COLUMN book_club_portal_published TINYINT(1) NOT NULL DEFAULT 0;

-- Existing book club affiliations: keep prior behavior (portal was already reachable).
UPDATE agencies
SET book_club_portal_published = 1
WHERE LOWER(COALESCE(club_kind, '')) = 'book_club';
