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

---

## 8. Architecture — shared helpers (added 2026-04-20)

The finalize controller historically had **six** near-identical
"create a `client_phi_documents` row + audit log" blocks, **two**
near-identical "persist this child's demographics + insurer + mark
checklist received" blocks, and **two** near-identical "send the
completion email + always log to Communications tab" blocks. Each pair
drifted independently every time we patched one — that is **the** root
cause of the "we keep fixing it and re-breaking it" loop.

These have been collapsed into three helpers. **All future additions
must use them — do not inline a fresh PHI insert / demographics persist
/ email send block.** If a helper doesn't fit your case, extend the
helper; do not duplicate it.

### 8.1 `attachSignedPdfToClient`

Location: `backend/src/services/phiDocumentAttachment.service.js`

This is **the** way to put any artifact (signed PDF, answers PDF,
text dump, registration ticket, ROI, packet bundle, future
questionnaire/assessment output) onto a client's Documentation tab.

It guarantees:
- `agency_id` and `school_organization_id` (both NOT NULL columns) are
  resolved from a **consistent** fallback chain: explicit override →
  the client row → the link's `organization_id`. The silent failures
  that lost sibling 2's PHI on multi-child submissions came from each
  call site using a **different** fallback chain — that class of bug
  is now structurally impossible.
- A `client_phi_documents` insert failure logs `sqlCode` / `sqlState` /
  `message` / `stack` and returns a structured `{ ok: false, reason,
  sqlCode, sqlState }` so the caller's per-child loop continues with
  the rest of the children instead of aborting.
- The `phi_document_audit_log` row is best-effort (a missing audit row
  is bad, but losing the document attachment because the audit insert
  failed is worse). Audit failures still log loudly.
- It NEVER throws. All call sites can `await` without a try/catch.

Call sites currently routed through it:
- `createIntakeTextDocuments` (per-child answers/summary `.txt`)
- `createIntakePiecePdfDocuments` (per-child answers `.pdf` + ticket `.pdf`)
- `createIntakePacketDocument` (combined packet, single-child only)
- Smart School ROI finalize (early branch + embedded ROI step)
- Per-template signed PDFs in the school/intake Branch A
- Per-template signed PDFs in the registration Branch B

### 8.2 `persistChildIntakeData`

Location: top of `publicIntake.controller.js` (controller-local because
its dependencies — `buildMergedDemographicsForPersist`,
`persistClientDemographicsIfProvided`, `applyClientIntakeCompletion` —
are all controller/service-local already).

Called once per child inside the per-client loop. Does, in order:
1. Build per-child demographics with `intakeData.responses.clients[i]`
   taking priority over submission-level fields. **This** is what was
   missing for sibling 2 — without it, both kids got each other's
   grade/DOB/address (or nothing).
2. Persist demographics to `clients` (grade, language, address, DOB,
   sex, eloping/assistance flags + notes).
3. Mirror the primary insurer name from the insurance step.
4. Auto-mark the Document Status checklist for that child as RECEIVED.

Each step is independent — failure in one does not abort the others.

### 8.3 `deliverPacketCompletionEmail`

Location: top of `publicIntake.controller.js`.

Called once per finalize after the packet PDF is built. Does:
1. Try `sendEmailFromIdentity` if a sender identity exists.
2. Fall back to `EmailService.sendEmail` with the shared signature
   block applied.
3. Honor `sendResult.skipped` from the unified sender (platform send
   gate).
4. On any failure (prep or send), write a `user_communications` row
   via `logSkippedOrFailedEmail` so the Communications tab always has
   a breadcrumb. The user explicitly required: "there should at least
   be an email that was attempted... something."
5. NEVER throws — returns `{ sent, skipped, error, errorMessage }` so
   the caller populates `emailDelivery` for the API response.

The outer try/catch in each finalize branch now only wraps the
`packetEmail` template render — everything send-related is in the
helper.

---

## 9. Adding new signed documents, forms, or assessments

The user's roadmap explicitly includes:

> "I may add 10 more documents to be signed or filled out... freely
> register people for events and even use future digital forms in a way
> that I can assign and integrate to people's accounts, etc., like with
> surveys or similar like with questionnaires and actual tests like the
> GAD7 or the PHQ9... All of that would need to be issued in an intake
> packet and signed, filled out, etc."

Here is the playbook so the foundation actually scales.

### 9.1 Adding another signed document template

**You should not need to touch the finalize controller at all.**

1. Insert a row into `document_templates` with `is_active = TRUE`.
2. Make sure the link/agency that owns the intake includes that
   template in its packet (via `link_document_templates` or whatever
   join the link uses).
3. The per-template loop in both finalize branches already iterates
   over every template attached to the link — your new template will
   be merged, signed, and routed through `attachSignedPdfToClient`
   automatically.

The only thing to verify after adding a new template is the smoke
test in §7 — specifically that the new template appears under
"Documents" for the test child.

### 9.2 Adding a new digital form / questionnaire / assessment (GAD7, PHQ9, custom survey)

These are **not** `document_templates`. They are intake form steps
whose answers need to be:

1. Persisted as structured data (so we can score, report, trend).
2. Persisted as a human-readable PDF (so the parent and clinician have
   a record on the Documents tab).
3. Optionally re-administered later (assessments are not one-shot).

The pattern to follow:

a. **Define the form as an intake step.** Put it in the intake form
   builder so it shows up between existing steps. Use a unique
   `stepId` so its answers land at
   `intakeData.responses.clients[i][stepId]` (per-child) or
   `intakeData.responses.submission[stepId]` (submission-level — only
   for things like guardian signature).

b. **Add a scoring helper next to the form definition** (e.g.
   `services/assessments/gad7.service.js`) that takes the raw answers
   and returns `{ score, severity, completedAt }`. Keep scoring out of
   the controller.

c. **Persist structured results.** Either (i) extend `clients` with
   columns if the assessment is "always part of intake" (rare), or
   (ii) add a dedicated table like `client_assessment_results`
   (`id`, `client_id`, `assessment_type`, `score`, `severity`,
   `raw_answers JSON`, `submission_id`, `completed_at`). Option (ii)
   scales — every new assessment is a new `assessment_type` value, no
   schema change.

d. **Persist the human-readable PDF** by calling
   `attachSignedPdfToClient` with `documentType: 'GAD-7 Result'` (or
   similar). Build the PDF once with a tiny per-assessment renderer
   service (`buildGad7Pdf({ answers, score, severity })` returning a
   `Buffer`), upload via `StorageService.saveIntakePieceDocument`,
   then attach. **Do not** invent a parallel PHI insert path.

e. **Auto-mark the corresponding checklist item as RECEIVED.** Add the
   assessment to the Document Status checklist as a
   `paperwork_item_type`. `applyClientIntakeCompletion` (called from
   `persistChildIntakeData`) already marks every item on the checklist
   received — your new item will be picked up automatically as long as
   it is on the checklist.

f. **Surface it on the Overview / clinical card.** A new tile that
   reads from `client_assessment_results` (or whatever you chose in
   (c)) is the only frontend change. Do **not** add a re-derivation
   step that recomputes the score from `intakeData` on every page
   load — store it once at finalize.

g. **Re-administration.** When the same assessment is sent again later
   (a clinician hands a parent a new GAD-7), the same finalize path
   should be reused. That means assessment forms must be issuable as
   a stand-alone digital form (an `intake_links` row that contains
   only that form), not just as part of a packet. The finalize
   controller already handles "links with arbitrary form contents" —
   nothing new is needed as long as you keep using
   `attachSignedPdfToClient` and `persistChildIntakeData`.

### 9.3 Multi-account / household / sibling expansion

The per-client loop already iterates over `intakeData.responses.clients`
in both branches. The two things you must keep true to scale this:

1. **Every per-child write must key on `clients[i]`, not on the
   submission-level fields.** This includes demographics
   (`persistChildIntakeData` already does this), assessment results
   (use `clients[i][assessmentStepId]`), and any future per-child
   data. The "carter vs carmen" bug was caused by writing
   submission-level fields to every child.

2. **Storage paths must be unique per child.** `client_phi_documents`
   has a UNIQUE constraint on `storage_path`. Per-template signed PDFs
   already produce per-child paths; if you add a new artifact, route
   it through `StorageService.saveIntakePieceDocument` (which already
   namespaces by `clientId`). Never reuse a single submission-level
   path across children.

### 9.4 Events, registrations, and self-pay

The registration flow already supports:
- Catalog selection per step (`registrationSelectionsByStep`)
- Self-pay (`selfPay.enabled`, `selfPay.paymentLinkUrl`)
- Enrollment via `enrollClientsInCompanyEvent`
- Confirmation ticket PDF via `buildRegistrationTicketPdf`

When adding a new event type or registration variant:
- Extend `registrationCatalog.service.js` to surface the new entity
  type. Don't branch on entity type inside the controller.
- The ticket PDF is one function — if a new variant needs different
  ticket fields, add them there, not in the controller.
- Self-pay payments must continue to go through the existing
  `QuickBooksPaymentsService` / `StripePaymentsService` paths. Don't
  add a third payment integration inline in the controller; add it as
  a service and select it via the agency's billing config.

---

## 10. Refactor history (so we know what changed and why)

Tracking material refactors here so the next person (or the next
agent) doesn't undo them by accident.

### 2026-04-20 — Three-helper consolidation

Before:
- 6 inline `ClientPhiDocument.create` blocks, each with a slightly
  different agency/org fallback chain. Multi-child submissions
  silently lost sibling 2's PHI rows when one fallback chain
  produced `null` for `agency_id` (NOT NULL) but another didn't.
- 2 inline demographics+insurer+checklist blocks (school-roi vs
  registration). Registration originally skipped demographics
  entirely — that's why every registered child showed "-" for
  grade/DOB/sex/address on the Overview tab.
- 2 inline email send + Communications-row blocks. The registration
  branch had a blank `} catch {}` that hid every send failure for
  weeks.

After:
- `attachSignedPdfToClient` (in
  `backend/src/services/phiDocumentAttachment.service.js`,
  186 lines, well-documented). All 6 PHI insert sites route through
  it.
- `persistChildIntakeData` (controller-local). Both finalize branches
  call it identically.
- `deliverPacketCompletionEmail` (controller-local). Both finalize
  branches call it identically. Outer try/catch only wraps template
  render, not the send itself.

Controller line count: **9,225 → 9,080** (−145). Total code lines
including the new service file: 9,225 → 9,266 (+41). The deduplication
is the primary win — future fixes to PHI attachment logic, per-child
demographics persistence, or completion-email behavior happen in **one**
place instead of two-to-six.

No school-ROI specific semantics changed. `applySmartSchoolRoiAccessDecisions`,
`applyClientRoiCompletion`, and `ClientSchoolRoiSigningLink.markCompleted`
all still run exactly as before. The smart school ROI branch just goes
through the new helpers for the underlying writes.

## §11. Returning-family + new-sibling on the same packet (added 2026-04-20)

### Background

`resolveIntakeExistingClientAttach` (in `publicIntake.controller.js`) is the
gate that decides whether a finalize submission attaches to an EXISTING
returning-family client (auto-match by signer email + school + child name,
or explicit `consent_org_match` selection) vs. always creating brand-new
client rows from `payload.clients`. **It only ever inspects
`payload.clients[0]`.** That's intentional — an unambiguous match across a
multi-child packet would require name+DOB+org disambiguation that we don't
yet have UI for, and the parent's intent is captured well enough by "child
1 is the returning kid".

The historical bug: when child 1 matched, the controller's matched-attach
branch used to do `createdClients = [existingClient]`, which threw away
`payload.clients[1..N]` entirely. Carter (new) was lost the moment Carmen
(returning) matched. Sub 300 lost "Client Example2" the moment "Client1
Example" matched. Symptom: only one child's name on the success screen,
only one child in `intake_submission_clients`, only one child receives PHI
docs / completion emails / per-child packets, and the smoke shows
`rawClientsCount: 1` even though the parent filled out and signed for
multiple kids.

### Current behavior (school-ROI flow AND registration flow, both fixed)

When `resolveIntakeExistingClientAttach` returns an `attachClientId`:

1. The matched child is attached to the existing client row exactly as
   before (`updatedSubmission.client_id = existingClient.id`).
2. **If `payload.clients.length > 1`**, every additional sibling (i.e.
   `payload.clients.slice(1)`) is created via the new
   `PublicIntakeClientService.createAdditionalSiblingClients({ link, payload, siblings })`
   helper. That helper internally calls the same per-payload provisioning
   path (`provisionSingleIntakeClient`) that fresh-family submissions use
   → identical `client_type` resolution, identifier code, paperwork seed,
   org affiliations, status history. There is no second code path; siblings
   created via the matched branch are byte-for-byte indistinguishable from
   siblings created via the fresh branch.
3. The full set `[existingClient, ...newSiblings]` is then passed (once)
   to `provisionGuardianForIntakeClients` so the guardian links to all kids
   in a single transaction shape.
4. `createdClients` becomes the full list, so every downstream loop
   (per-client signing, per-client packet attach, per-client completion
   email sections, smoke `phi_docs_per_child` check, etc.) sees every
   child the parent submitted.

**Sibling auto-match is intentionally NOT attempted (yet).** Each sibling
beyond child 1 is always created as a brand-new client row, even if they
happen to share a name+org with another existing client. Reasons:

- A duplicate row is a recoverable problem (merge tooling exists).
- A silently-dropped child is NOT a recoverable problem (the parent
  thinks the kid is enrolled and they aren't).
- Multi-child auto-match would require name+DOB+org disambiguation we
  don't yet have UI for and the false-positive risk is significantly
  higher than the single-child case.

If/when we add per-child returning-family auto-match, the natural seam is
`createAdditionalSiblingClients` itself — the controller call site does
not change.

### Failure handling

`createAdditionalSiblingClients` is wrapped in its own try/catch in BOTH
finalize branches. If sibling creation fails (bad payload, transient
DB hiccup), the controller LOUDLY logs and proceeds with just the matched
child. Rationale: the parent's matched-child packet still lands today
(better than nothing) and the missing sibling will trip the smoke's
`phi_docs_per_child` and `per_child_bundle_path` checks plus the loud
log line, so the gap is attributable and recoverable. A throw here would
also block the matched child's packet, which is strictly worse.

### Diagnostic logs to look for

- Success: `[publicIntake] returning-family matched + created brand-new siblings (school-roi flow)`
  or `(registration flow)` with `matchedClientId`, `matchSource`,
  `submittedClientCount`, and `siblingsCreatedIds`.
- Failure: `[publicIntake] createAdditionalSiblingClients failed (school-roi flow) — matched client will proceed, additional siblings dropped`
  with `matchedClientId`, `attemptedSiblingCount`, error+stack.

### Adding new digital forms / surveys / GAD7-style questionnaires

Nothing in this section needs to change. The matched-attach + sibling-
create logic runs BEFORE any per-template signing or per-child PHI
attachment loops, so by the time your new template gets to
`attachSignedPdfToClient`, every kid already has a `client_id`. New
template-level work continues to follow §9.

### Files

- `backend/src/services/publicIntakeClient.service.js` — added
  `provisionSingleIntakeClient` (extracted from existing for-loop) and
  `PublicIntakeClientService.createAdditionalSiblingClients`. Existing
  `createClientAndGuardian` was refactored to use the same shared
  per-payload provisioner so fresh-family and matched-family siblings are
  created via the exact same code.
- `backend/src/controllers/publicIntake.controller.js` — the matched-attach
  branch in BOTH `finalizeIntake` (school-ROI flow) and the registration
  finalize handler now invoke `createAdditionalSiblingClients` for
  `payload.clients.slice(1)` when present.

---

## §12. Per-child Intake Packet PHI doc + per-child Communications row for multi-child submissions (added 2026-04-21)

### Background

After §11 was shipped, the smoke confirmed both kids made it through the
per-client signing loop and got demographics + per-child bundles. But the
smoke ALSO surfaced two follow-on multi-child gaps:

```
phi: total=7 packet=0 ...   ← child 1 missing Intake Packet PHI doc
phi: total=7 packet=0 ...   ← child 2 missing Intake Packet PHI doc
FAILURES:
  - completion_email_communications_row, clientId=<sibling>
    "submission has signer_email but no user_communications row..."
```

Root cause: the school-ROI finalize handler historically wrapped THREE
distinct things in a single `if (pdfPaths.length > 0 && !isMultiChildSubmission)`
gate:

1. The **combined-bundle build/upload** (correct to gate to single-child —
   merging multiple kids' PHI into one file is undesirable).
2. The **per-client Intake Packet PHI attach loop** (incorrectly gated —
   each child has their own per-child bundle that should be registered as
   `client_phi_documents.document_type='intake_packet'`).
3. The **completion-email send + Communications-tab logging** (incorrectly
   gated — the email is per-submission and should fire for multi-child too).

The registration flow had already been split apart correctly. The school-ROI
flow had not. As a result, multi-child school-ROI finalizes silently
skipped the per-child packet attach AND the completion email send. Each
child's portal Documents list and Communications tab looked empty even
though the parent had signed and submitted the packet.

A second, separate gap existed in BOTH flows: even when the email DID fire,
`deliverPacketCompletionEmail` only writes ONE `user_communications` row,
attached to the submission's primary `client_id`. Sibling kids 2..N saw an
empty Communications tab.

### Current behavior (school-ROI flow AND registration flow, both fixed)

**Per-child Intake Packet PHI doc.** The school-ROI finalize handler now
mirrors the registration flow's structure:

```js
if (pdfPaths.length > 0) {
  if (!isMultiChildSubmission) {
    try { /* combined bundle build/save (single-child only) */ } catch { ... }
  }
  // Per-client packet attach loop — ALWAYS runs, single OR multi
  for (let pi = 0; pi < rawClients.length; pi += 1) { ... }
  // Email block — ALWAYS runs, single OR multi
  if (updatedSubmission.signer_email) { ... } else { ... }
}
```

The per-client loop uses `intake_submission_clients.bundle_pdf_path` (the
per-child bundle saved earlier in the per-client signing loop) as the
`storage_path`. Single-child submissions still hit the combined-bundle
dedup so the only child's `bundle_pdf_path` points at the combined bundle.

**Per-child Communications row.** A new `mirrorPacketCompletionRowToSiblings`
helper (defined right next to `deliverPacketCompletionEmail` in
`publicIntake.controller.js`) writes one additional `user_communications`
row per sibling beyond the primary, mirroring:

- `template_type` (`intake_packet_completion`) — so existing UI filters
  pick them up without changes
- `delivery_status` (sent / skipped / failed) — same as the primary outcome
- `subject` (with `(sibling copy)` suffix as a forensic hint)
- `metadata.mirroredFromClientId` and `metadata.isSiblingMirror: true`

The actual outbound send is still ONCE (one email to the signer, attached
to the submission's primary `client_id`). The sibling rows are pure
Communications-tab visibility — they don't trigger second sends or count
against email-rate metrics. All sibling-mirror failures are non-blocking.

The mirror is invoked at every email outcome point in BOTH flows:

| Outcome | Primary row written by | Sibling mirror invoked |
|---|---|---|
| Send succeeded (or skipped by gate) | `deliverPacketCompletionEmail` | with `outcome=sendOutcome` |
| Send threw (`prep_failed` or transport) | controller `catch` + `logSkippedOrFailedEmail` | with `outcome={ sent: false, error: 'prep_failed' }` |
| `EmailService.isConfigured() === false` (registration flow only) | `logSkippedOrFailedEmail` | with `outcome={ skipped: true, error: 'email_not_configured' }` |
| No `signer_email` on the submission | `logSkippedOrFailedEmail` | with `outcome={ skipped: true, error: 'no_signer_email' }` |

### Smoke test signal

`npm run smoke:intake` now requires for each child of a multi-child finalize:

- `phi: ... packet=1` (the per-child Intake Packet PHI doc)
- `comms: latest=sent` (or `skipped`/`failed` — but a row MUST exist) for
  every child, not just the matched/primary one. The smoke check at
  `verifyMultiChildIntake.js` keys on `client_id` and template_type
  `intake_packet_completion`, so the mirror rows satisfy it.

### Diagnostic logs

- `[publicIntake] mirrored completion email row to siblings` with
  `submissionId`, `flow`, `primaryClientId`, `siblingCount`, `mirrored`,
  `deliveryStatus`. Fires once per email outcome point when there are 2+
  kids on the submission.
- `[publicIntake] sibling completion-email mirror failed` per sibling
  if a mirror row write throws (non-blocking — the primary row already
  exists, the rest of the finalize keeps going).
- `[publicIntake] combined bundle build/save failed (school-roi flow) — continuing so per-client Intake Packet docs and completion email still go out`
  is now actually meaningful for multi-child since the per-client packet
  attach + completion email survive a failed combined-bundle build (they
  used to be inside the same gate so a bundle failure looked identical
  to a multi-child submission).

### Why the mirror approach (vs. one-row-per-submission UI change)

Two viable designs were considered:

1. **Mirror rows per child** (chosen). Each child has an explicit
   `user_communications` row → no UI change needed, every existing tab
   filter (`WHERE client_id = ?`) keeps working, retention/audit tooling
   sees the row alongside everything else for that child.
2. **One row per submission, query by `intake_submission_id`**. Cleaner
   storage but every UI surface that lists Communications by client would
   need a join to discover sibling rows. We don't currently store
   `intake_submission_id` on `user_communications`, so this would also
   need a schema/migration change.

The mirror approach trades a tiny amount of duplicate storage for zero UI
churn and zero schema churn. `metadata.mirroredFromClientId` makes the
relationship recoverable for future tooling.

### Adding new digital forms / surveys / GAD7-style questionnaires

If your new completion email needs the same multi-child Communications
visibility, call `mirrorPacketCompletionRowToSiblings` immediately after
the primary `deliverPacketCompletionEmail` (or the equivalent
`logSkippedOrFailedEmail` for skip/fail paths). Pass the same `subject`,
`text`, `html`, the `outcome` object, and `siblingClientIds` =
`createdClients.map(c => c.id)` — the helper filters out the primary
itself, so passing the full list is safe and idiomatic.

If you introduce a new template_type, pass it via the helper's
`templateType` parameter so the smoke and the Communications tab filter
agree on which rows are which.

### Files

- `backend/src/controllers/publicIntake.controller.js`
  - New helper `mirrorPacketCompletionRowToSiblings` next to
    `deliverPacketCompletionEmail`.
  - School-ROI finalize handler: gate at line ~6611 changed from
    `if (pdfPaths.length > 0 && !isMultiChildSubmission)` to
    `if (pdfPaths.length > 0)`, with an inner
    `if (!isMultiChildSubmission)` wrapping ONLY the combined-bundle
    build. Per-client packet attach loop, staff `notifyNewPacketUploaded`,
    and completion-email block now run for multi-child too.
  - Both flows now invoke `mirrorPacketCompletionRowToSiblings` at every
    email outcome point (success, prep_failed, email_not_configured,
    no_signer_email).
- `backend/src/scripts/verifyMultiChildIntake.js` already enforces
  `packet>=1` per child and at-least-one `intake_packet_completion` row
  per child — these checks now PASS for multi-child finalizes.
