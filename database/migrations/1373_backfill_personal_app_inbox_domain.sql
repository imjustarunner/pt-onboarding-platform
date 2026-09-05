-- Migration 1373: Backfill personal app inboxes off @plottwisthq.com onto agency workspace domain
-- Only rewrites auto personal_{userId} identities when the new address is free.

CREATE TEMPORARY TABLE tmp_personal_inbox_domain_map (
  identity_id INT NOT NULL PRIMARY KEY,
  inbox_id INT NULL,
  new_email VARCHAR(255) NOT NULL,
  new_display VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_personal_inbox_domain_map (identity_id, inbox_id, new_email, new_display)
SELECT
  esi.id AS identity_id,
  ci.id AS inbox_id,
  CONCAT(
    SUBSTRING_INDEX(esi.from_email, '@', 1),
    '@',
    target.domain
  ) AS new_email,
  CASE
    WHEN ci.display_name LIKE '%(My Inbox)' THEN REPLACE(ci.display_name, '(My Inbox)', '(App inbox)')
    WHEN ci.kind = 'personal' AND (ci.display_name IS NULL OR ci.display_name = '' OR ci.display_name = 'My Inbox')
      THEN 'App inbox'
    ELSE ci.display_name
  END AS new_display
FROM email_sender_identities esi
INNER JOIN agencies a ON a.id = esi.agency_id
LEFT JOIN communication_inboxes ci
  ON ci.sender_identity_id = esi.id AND ci.kind = 'personal'
INNER JOIN (
  SELECT
    a2.id AS agency_id,
    COALESCE(
      NULLIF(LOWER(JSON_UNQUOTE(JSON_EXTRACT(a2.feature_flags, '$.workspaceEmailDomain'))), ''),
      (
        SELECT LOWER(SUBSTRING_INDEX(esi2.from_email, '@', -1))
        FROM email_sender_identities esi2
        WHERE esi2.agency_id = a2.id
          AND esi2.from_email LIKE '%@%'
          AND (esi2.identity_key IS NULL OR esi2.identity_key NOT LIKE 'personal_%')
          AND LOWER(SUBSTRING_INDEX(esi2.from_email, '@', -1)) NOT IN ('plottwisthq.com', 'gmail.com', 'example.com')
        ORDER BY esi2.id ASC
        LIMIT 1
      )
    ) AS domain
  FROM agencies a2
) target ON target.agency_id = a.id
WHERE esi.identity_key LIKE 'personal_%'
  AND LOWER(SUBSTRING_INDEX(esi.from_email, '@', -1)) = 'plottwisthq.com'
  AND target.domain IS NOT NULL
  AND target.domain <> ''
  AND target.domain <> 'plottwisthq.com'
  AND NOT EXISTS (
    SELECT 1
    FROM email_sender_identities taken
    WHERE taken.agency_id = esi.agency_id
      AND taken.id <> esi.id
      AND LOWER(taken.from_email) = LOWER(CONCAT(
        SUBSTRING_INDEX(esi.from_email, '@', 1),
        '@',
        target.domain
      ))
  );

UPDATE email_sender_identities esi
INNER JOIN tmp_personal_inbox_domain_map m ON m.identity_id = esi.id
SET
  esi.from_email = m.new_email,
  esi.reply_to = m.new_email;

UPDATE communication_inboxes ci
INNER JOIN tmp_personal_inbox_domain_map m ON m.inbox_id = ci.id
SET
  ci.from_email = m.new_email,
  ci.display_name = COALESCE(m.new_display, ci.display_name);

UPDATE communication_inboxes
SET display_name = REPLACE(display_name, '(My Inbox)', '(App inbox)')
WHERE kind = 'personal'
  AND display_name LIKE '%(My Inbox)';

DROP TEMPORARY TABLE IF EXISTS tmp_personal_inbox_domain_map;
