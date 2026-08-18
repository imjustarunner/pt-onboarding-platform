-- Migration 1235: Mark demo/test people so they stay off official documents
ALTER TABLE users
  ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = demo/test account; exclude from official documents and disclosure';

ALTER TABLE clients
  ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = demo/test client; exclude from official documents';

CREATE INDEX idx_users_is_demo ON users (is_demo);
CREATE INDEX idx_clients_is_demo ON clients (is_demo);

-- Known ITSCO disclosure demo names + Hogwarts-style packet identities
UPDATE users u
SET u.is_demo = 1
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) IN (
  'karen kool',
  'sloppy lady',
  'ada lovelace',
  'admin one',
  'qr tester',
  'robin williams',
  'piper finch',
  'harry potter',
  'hermione granger',
  'ron weasley',
  'albus dumbledore',
  'severus snape',
  'minerva mcgonagall',
  'rubeus hagrid',
  'luna lovegood',
  'neville longbottom',
  'draco malfoy',
  'dolores umbridge',
  'remus lupin',
  'alastor moody',
  'kingsley shacklebolt',
  'nymphadora tonks',
  'filius flitwick',
  'pomona sprout'
);

-- Interns previously moved off ITSCO disclosure
UPDATE users u
SET u.is_demo = 1
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) IN (
  'jennifer ablondie',
  'amy carson',
  'jennifer thomas'
)
AND (
  LOWER(COALESCE(u.role, '')) IN ('intern', 'intern_plus')
  OR LOWER(COALESCE(u.credential, '')) LIKE '%intern%'
);

-- Test-account switcher roster
UPDATE users u
INNER JOIN demo_test_accounts d ON d.user_id = u.id
SET u.is_demo = 1
WHERE COALESCE(d.is_active, 1) = 1;

-- Hogwarts / Durmstrang emails or memberships
UPDATE users u
SET u.is_demo = 1
WHERE LOWER(CONCAT(COALESCE(u.email, ''), ' ', COALESCE(u.username, '')))
  REGEXP 'hogwarts|durmstrang';

UPDATE users u
INNER JOIN user_agencies ua ON ua.user_id = u.id
INNER JOIN agencies a ON a.id = ua.agency_id
SET u.is_demo = 1
WHERE LOWER(CONCAT(COALESCE(a.slug, ''), ' ', COALESCE(a.name, ''), ' ', COALESCE(a.portal_url, '')))
  REGEXP 'hogwarts|durmstrang';

-- Keep demo people off disclosure packets
UPDATE user_agencies ua
INNER JOIN users u ON u.id = ua.user_id
SET ua.include_on_disclosure = 0
WHERE u.is_demo = 1
  AND (ua.include_on_disclosure IS NULL OR ua.include_on_disclosure = 1);

-- Hogwarts-attached clients
UPDATE clients c
INNER JOIN agencies org ON org.id = c.organization_id
SET c.is_demo = 1
WHERE LOWER(CONCAT(COALESCE(org.slug, ''), ' ', COALESCE(org.name, ''))) REGEXP 'hogwarts|durmstrang';

UPDATE clients c
SET c.is_demo = 1
WHERE LOWER(CONCAT(COALESCE(c.full_name, ''), ' ', COALESCE(c.initials, '')))
  REGEXP 'hogwarts|potter|granger|weasley|dumbledore|snape';
