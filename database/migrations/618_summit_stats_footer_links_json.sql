-- Summit Stats Challenge: optional footer legal links (label + URL) for /ssc and club (affiliation) portals.
-- When non-empty JSON array, replaces default Privacy/Terms/Public Proof/Platform HIPAA row in PoweredByFooter.

ALTER TABLE platform_branding
  ADD COLUMN summit_stats_footer_links_json JSON NULL
  COMMENT 'SSC club portals: JSON array of label and href footer links. Null uses default platform legal links.'
  AFTER platform_hipaa_url;
