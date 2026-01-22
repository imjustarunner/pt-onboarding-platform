# Fix: Stable row tracking key for payroll import carryover (v4 natural key)

## Goal
Row-level tracking across uploads is breaking because the system sometimes recomputes an identifier using incomplete fields and (in some paths) a secret-based fallback. Replace the identifier with a deterministic, human-readable **natural key string** built only from columns that are stable across uploads for the same row.

This change must:
- Produce the **same** row key for the same logical service row across uploads.
- Avoid dependency on secrets (no HMAC/HASH).
- Avoid using volatile fields (units, payment, status, balances, comments, etc.).
- Work when **patient_member_id** is missing.
- Eliminate preview-path mismatches caused by missing patient name fields.

---

## The stable row key (v4)

### Preferred (when Patient Member ID exists)
```
v4|agency:{agencyId}|dos:{YYYY-MM-DD}|code:{SERVICE_CODE}|clin:{clinician}|pid:{patientMemberId}
```

### Fallback (when Patient Member ID is missing)
```
v4|agency:{agencyId}|dos:{YYYY-MM-DD}|code:{SERVICE_CODE}|clin:{clinician}|ln:{lastName}|fn:{firstName}|dob:{YYYY-MM-DD-or-empty}
```

**Do not include**: units, note status, payable flags, payment fields, rates, balances, comments, or any fields that can change between uploads.

---

## Implementation

### 1) Add a row key builder (drop-in replacement)

Create (or replace your existing fingerprint builder with) this function:

```ts
function computeRowKeyV4({
  agencyId,
  serviceCode,
  serviceDate,
  clinicianName,
  patientMemberId,
  lastName,
  firstName,
  dob,
}: {
  agencyId: string | number;
  serviceCode: string;
  serviceDate: string | Date | null | undefined;
  clinicianName: string;
  patientMemberId?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  dob?: string | Date | null;
}) {
  const norm = (v: unknown) =>
    String(v ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const normCode = (v: unknown) =>
    String(v ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();

  const ymd = (d: unknown) => ymdOrEmpty(d); // use existing helper

  const dos = ymd(serviceDate);
  const code = normCode(serviceCode);
  const clin = norm(clinicianName);

  const pid = norm(patientMemberId);
  if (pid) {
    return `v4|agency:${agencyId}|dos:${dos}|code:${code}|clin:${clin}|pid:${pid}`;
  }

  const ln = norm(lastName);
  const fn = norm(firstName);
  const dobYmd = ymd(dob);

  return `v4|agency:${agencyId}|dos:${dos}|code:${code}|clin:${clin}|ln:${ln}|fn:${fn}|dob:${dobYmd}`;
}
```

**Normalization rules**
- `clinicianName`, `firstName`, `lastName`, `patientMemberId`: trim, collapse whitespace, lowercase.
- `serviceCode`: trim, remove whitespace, uppercase.
- `serviceDate` / `dob`: convert to `YYYY-MM-DD` via `ymdOrEmpty`.

---

### 2) Ensure preview/carryover loads the fields needed to build the key

Problem today: some preview paths only select a minimal set of columns, so fallback recomputation lacks stable patient name fields and generates a different ID.

Update the query that loads import rows used for carryover preview (and any similar paths) to include the stable identity columns:

- `patient_member_id`
- `first_name`
- `last_name`
- `dob`
- `clinician_name` (if distinct from `provider_name`)
- plus existing fields (`service_code`, `service_date`, etc.)

Conceptual example:
```sql
SELECT
  pir.user_id,
  pir.provider_name,
  pir.clinician_name,
  pir.service_code,
  pir.service_date,
  pir.row_fingerprint,
  pir.patient_member_id,
  pir.last_name,
  pir.first_name,
  pir.dob,
  pir.note_status,
  pir.draft_payable,
  pir.unit_count
FROM payroll_import_rows pir
WHERE pir.payroll_period_id = ?
  AND pir.payroll_import_id = ?;
```

(Adjust column names to your schema.)

---

### 3) Use row_fingerprint if present, else compute v4 key from loaded columns

Replace any fallback that calls a legacy fingerprint function (or parses clinicianName into patient names).

```ts
const rowKey =
  r.row_fingerprint ||
  computeRowKeyV4({
    agencyId: prior.agency_id,
    serviceCode: r.service_code,
    serviceDate: r.service_date,
    clinicianName: r.clinician_name || r.provider_name || "",
    patientMemberId: r.patient_member_id,
    lastName: r.last_name,
    firstName: r.first_name,
    dob: r.dob,
  });
```

**Important:** do not compute a key with missing patient name fields. If the DB doesn’t provide them, fix the SELECT first.

---

### 4) Backfill so every row has a v4 row_fingerprint

To avoid having different rows computed in different ways forever, do a one-time backfill:

- For each `payroll_import_rows` record where `row_fingerprint` is NULL/empty:
  - compute `computeRowKeyV4(...)`
  - update `row_fingerprint` to that string.

Pseudo:
```ts
for (const r of rowsMissingFp) {
  const fp = computeRowKeyV4(...);
  await db.query("UPDATE payroll_import_rows SET row_fingerprint=? WHERE id=?", [fp, r.id]);
}
```

After backfill, your preview path should rarely need fallback computation.

---

### 5) Don’t drop rows from tracking just because user_id is missing

Another cause of “not tracking”: logic that returns early when `user_id` is missing:

```ts
const userId = Number(r?.user_id || 0);
if (!userId || !serviceCode) return;
```

Change behavior:
- Always compute and compare `rowKey` for tracking transitions.
- Only do attribution to a user when `user_id` is present.
- This allows rows that start as `user_id = 0` to still participate in carryover matching and later become attributable when mapping improves.

Minimum safe approach:
- Maintain a map keyed by `rowKey` regardless of `user_id`.
- Maintain a second map `rowKey -> user_id` when available.

---

## Validation queries (post-change)

### A) Missing fingerprints
```sql
SELECT
  payroll_import_id,
  COUNT(*) AS total_rows,
  SUM(row_fingerprint IS NULL OR row_fingerprint = '') AS missing_fp
FROM payroll_import_rows
WHERE payroll_period_id = ?
GROUP BY payroll_import_id;
```

### B) Potential collisions (should be rare unless truly duplicate services)
```sql
SELECT
  payroll_import_id,
  row_fingerprint,
  COUNT(*) AS cnt
FROM payroll_import_rows
WHERE payroll_period_id = ?
GROUP BY payroll_import_id, row_fingerprint
HAVING cnt > 1
ORDER BY cnt DESC;
```

---

## Acceptance criteria
- Re-uploading the same spreadsheet produces **identical** `row_fingerprint` strings for the same rows.
- Preview/carryover logic matches rows across uploads even when `patient_member_id` is missing (uses first/last name + clinician + DOS + code).
- No use of secrets in row identity generation.
- “Not tracking” incidents caused by recomputation mismatch are eliminated.
