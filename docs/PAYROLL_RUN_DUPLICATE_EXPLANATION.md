# Run Comparison Deduplication

## Session identity (fingerprint)

`rowKeyForSideBySide` prefers `row_fingerprint` when present. Fallback key:
`userId|provider|baseServiceCode|serviceDate|clientFirst|location`

- **clientFirst**: first token from patient name ("Gini Williamson" or "Williamson, Gini" → "gini")
- **baseServiceCode**: strips " - LOCATION" suffix for consistent matching
- **location**: from billing report Location column when available

Duration/units are **not** part of the key. Session identity persists across duration changes.

## Deduplication (fix)

When there are multiple rows for the same key in a run (e.g. billing report exports both old and new when duration is edited), we **pick one canonical row** instead of creating multiple merged rows:

1. **Status priority**: FINALIZED > DRAFT_PAID > DRAFT_UNPAID > NO_NOTE
2. **Within same status**: higher `unit_count` (the corrected duration)

So we show **one row per session**. The changing field (duration) is not used to establish the session; it is only used to choose which row to display when there are duplicates.
