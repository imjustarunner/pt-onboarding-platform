# Digital Forms / Public Intake — Contract & Regression Guard

This document is the **source of truth** for what the public intake / digital
forms pipeline must do on every successful submission. We have repeatedly
regressed in these areas (packet docs disappearing, completion email not
sending, Overview tab missing fields, guardian panel empty, SQL `LIMIT ?`
errors). Treat the requirements below as the acceptance test for any change
that touches:

- `backend/src/controllers/publicIntake.controller.js`
- `backend/src/controllers/phiDocuments.controller.js`
- `backend/src/controllers/client.controller.js`
- `backend/src/controllers/notificationSmsLog.controller.js`
- `backend/src/services/unifiedEmail/*.js`
- `backend/src/services/email.service.js`
- `backend/src/services/storage.service.js`
- `frontend/src/views/PublicIntakeSigningView.vue`
- `frontend/src/components/admin/ClientCommunicationsTab.vue`

If you change any of these files, you must re-verify every checklist item
below in a real submission (single-child + multi-child + school-ROI +
registration). Do not delete or weaken any requirement here without an
explicit reason in the same PR description.

---

## 1. Submission payload limits

- `express.json()` and `express.urlencoded()` in `backend/src/server.js`
  must allow at least **`10mb`**. Photos of insurance cards / IDs routinely
  push beyond the Express default (100kb) and trigger HTTP 413 on
  `/api/public-intake/finalize`.
- `frontend/src/views/PublicIntakeSigningView.vue` must call
  `sanitizeFinalizeResponses` before POSTing — it strips any `*_preview`
  base64 image fields. Don't remove that helper, and don't reintroduce
  `*_preview` fields into the finalize payload.
- The frontend must surface a friendly message if the server still returns
  413 (so the parent isn't stuck on a generic "failed" toast).

## 2. PHI documents created at finalize

For **every child** in the submission we must persist independent
`client_phi_documents` rows so the Documents tab is never empty. Failure
of any one piece must not block the others. Specifically:

| Doc kind | Source | Helper |
|---|---|---|
| Each signed template PDF | per-template merge in `processClient*` loop | existing per-template path |
| `Intake Responses (Answers).pdf` (per child) | `buildAnswersPdfBuffer({ link, intakeData, clientIndex })` | `createIntakePiecePdfDocuments` |
| `Registration Confirmation.pdf` (per child, registration flow only) | `buildRegistrationTicketPdf` | `createIntakePiecePdfDocuments` |
| Intake Responses (Answers).txt (per child) | text dump | `createIntakeTextDocuments` |
| `Intake Packet (Signed).pdf` combined bundle (single-child only) | `mergeSignedPdfsFromPaths` + `compressPdfBuffer` | inline, single-child only |

Multi-child submissions deliberately **do not** produce a combined
bundle — each child's per-child PDF is the canonical packet for that
child. A "Documents" page that only shows the combined PDF is a bug.

`createIntakePiecePdfDocuments` (in `publicIntake.controller.js`) and
`StorageService.saveIntakePieceDocument` (in `storage.service.js`) are
the storage entry points. **Do not** add a "self-heal / backfill on read"
helper into `phiDocuments.controller.js` — past versions did, and it
masked real regressions for weeks. If a piece is missing it is a
finalize-time bug, fix it there.

Every `ClientPhiDocument.create` failure inside the finalize handler
must `console.error` with `{ clientId, submissionId, code, sqlState,
message }`. Empty `catch {}` blocks here are forbidden.

## 3. Completion email

The completion email is the parent's primary record of the submission and
**must always go out** (or be visibly marked skipped/failed). Required
behaviour:

1. Send goes through `sendEmailFromIdentity` when an intake sender
   identity exists, otherwise falls back to `EmailService.sendEmail`.
2. **Attach the actual packet PDF** (not just the signed download URL).
   We hoist `combinedPdfBuffer` out of the bundle-build try block and
   pass it as `attachments: [{ filename, contentType:
   'application/pdf', contentBase64 }]`. Signed URLs expire / land in
   spam — the PDF bytes are non-negotiable.
3. If the unified sender returns `{ skipped: true, reason }`, the
   finalize handler must populate `emailDelivery.error =
   'skipped_<reason>'` so the response and the Communications tab show
   why no email went out.
4. Both the gate-skipped path AND the prep-failure path must
   `console.error` (not silent) so missed emails are diagnosable.
5. Even when the gate blocks the email, a `user_communications` row
   must be written with `delivery_status='skipped'` and the `error_message`
   set to `send skipped — <reason>`. This is what makes the
   Communications tab show "Send skipped — manual_only" instead of
   nothing. Both `EmailService.sendEmail` and
   `unifiedEmailSender.logSkippedOrFailedEmail` are responsible for this
   — keep both.
6. `frontend/src/components/admin/ClientCommunicationsTab.vue`'s
   `isFailureStatus` regex must include `skipped` so these rows render
   in the failure list.

## 4. Overview tab population

After finalize, the client's Overview tab must show:

- **Grade** (Education section) — sourced from
  `clients.grade`, persisted via `persistClientDemographicsIfProvided`
  using the intake key `client_grade`.
- **Client primary language** — read from
  `clients.primary_client_language`. The intake answer
  `client_preferred_language` must be **mirrored** to BOTH
  `clients.preferred_language` AND `clients.primary_client_language`,
  because the Overview reader and the clinical card reader use
  different columns.
- **Guardian primary language** — read from
  `clients.primary_parent_language`. The intake answer
  `guardian_preferred_language` must be mirrored to that column the
  same way.
- **Guardian (latest intake)** panel — populated from
  `client.guardian_intake_profile`. If the encrypted intake row is
  missing OR exists but lacks identifying fields (i.e.
  `guardianIntakeProfileMissingIdentity` returns true), we must enrich
  it with `buildGuardianProfileFallbackFromLinked` via
  `mergeGuardianIntakeWithFallback`. An "essentially empty" intake row
  (e.g. only `primaryLanguage` set) **must still** trigger the merge.
  This logic lives in `getClientById` and applies to BOTH the
  `super_admin` branch and the non-school-staff branch — keep them in
  sync.

## 5. SQL prepared-statement guard rails

- `mysql2` has a known bug where `LIMIT ?` and `OFFSET ?` placeholders
  throw `Incorrect arguments to mysqld_stmt_execute` when bound through
  `pool.execute`. Do **not** add `?` placeholders for `LIMIT` or `OFFSET`
  in any controller in this pipeline. Use the `safeInt` helper pattern
  used in `notificationSmsLog.controller.js` to validate the integer
  and inline it in the SQL string.
- If you see this error on the guardian Communications tab (or anywhere
  else), check for a recently added `LIMIT ?` / `OFFSET ?` binding
  before doing anything else.

## 6. Things we have repeatedly broken — DO NOT repeat

- **Silent `} catch {}` around `ClientPhiDocument.create`.** Every
  failure must log with `console.error` and the doc identifiers. Without
  this, the next regression looks like "documents just disappeared".
- **Backfilling missing PHI docs on read** in
  `phiDocuments.controller.js`. Removed intentionally. Reintroducing it
  hides finalize-time regressions and yields inconsistent state across
  agents/admins. Fix at write time.
- **Treating an existing-but-empty `client_guardian_intake_profile` as
  "good enough"** and skipping the linked-guardian fallback. The check
  must be on identifying fields, not on row presence.
- **Sending the completion email with `attachments: null`.** The packet
  bytes must be attached. The download URL is a convenience, not a
  substitute.
- **Persisting `preferred_language` only.** The Overview reads
  `primary_client_language` / `primary_parent_language`. Mirror to both.
- **Adding `LIMIT ?` placeholders** in `pool.execute` calls.
- **Removing the `*_preview` sanitizer** from
  `PublicIntakeSigningView.vue`. It is what keeps us under 10mb on
  finalize for parents who upload high-res photos.
- **Lowering the `express.json()` limit below `10mb`.**

## 7. Manual smoke-test checklist (run after any change in §1's file list)

Run all four flows. Each must satisfy every bullet.

### A. Single-child registration via demo link

- [ ] Submission completes within ~60s (no 8-minute hangs).
- [ ] Completion email arrives with the packet PDF attached AND a
      working signed download link.
- [ ] Communications tab shows the email row (or a `skipped`/`failed`
      row if the gate blocked it) under both the client and the
      guardian.
- [ ] Documents tab on the client lists: each signed template,
      `Intake Responses (Answers).pdf`, `Registration Confirmation.pdf`,
      and `Intake Packet (Signed).pdf`.
- [ ] Overview shows: Grade, client primary language, guardian primary
      language, guardian name/email/phone/relationship.

### B. Multi-child registration via demo link

- [ ] Each child gets their own per-child packet PDF in their own
      Documents tab.
- [ ] Combined "Intake Packet (Signed).pdf" is **NOT** created
      (multi-child intentionally skips it).
- [ ] Single completion email with per-child download links + answers
      + signed-document links, AND a per-child packet attachment when
      feasible (or at minimum a working link per child).

### C. School-ROI single-child

- [ ] Same as A, minus the registration-confirmation PDF (school-ROI
      flows don't generate registration tickets).

### D. Public-intake (no registration link)

- [ ] Submission persists `Intake Responses (Answers).pdf` even when no
      ticket exists.
- [ ] Email still goes out (or is logged as skipped/failed).

---

If any of the above fails, fix it **at the source** (the finalize
handler, the storage service, the email sender, or the controller
reader) — never with a band-aid in the consumer (Documents tab,
Overview tab, Communications tab). The consumers should be dumb
displays of what was persisted.
