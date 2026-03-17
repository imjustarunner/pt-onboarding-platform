# Run Comparison Deduplication

## Session identity

`rowKeyForSideBySide` and `rowEntityKey` use:
`userId|provider|serviceDate|baseServiceCode|client` (+ location for non-unit-editable codes)

- **H0031/H0032/H2014/H2032**: omit location from key so our unit edits match across runs
- **Other codes**: include location when present
- **Units** never in key—our corrections (60→5 etc.) must not flag as "new"

When WE change units for these codes, same clinician+date+code+client = same session.
Fallback matching merges added+removed into unit_change when primary key differs.

## Deduplication (fix)

When there are multiple rows for the same key in a run (e.g. billing report exports both old and new when duration is edited), we **pick one canonical row** instead of creating multiple merged rows:

1. **Status priority**: FINALIZED > DRAFT_PAID > DRAFT_UNPAID > NO_NOTE
2. **Within same status**: higher `unit_count` (the corrected duration)

So we show **one row per session**. The changing field (duration) is not used to establish the session; it is only used to choose which row to display when there are duplicates.
