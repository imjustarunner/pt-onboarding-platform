# Try AuricWell EHR Transition

The functional workspace is **Management → AuricWell → EHR Transition**. It uses the existing clients, contacts, insurance, clinical drafts, medical files and appointments. Provider import remains in the existing provider directory.

## Local sample preview

The task’s preview runs at **http://127.0.0.1:5185/auricwell-transition-preview.html**. Choose **Jordan Reed**, then **Taylor Example**. Open the blue sample panel for demographics, insurance, an agenda row and a fictional medical PDF.

This separate entry replaces browser storage with memory before importing application modules and installs a fixture-only API adapter. Fetch/XHR/beacon calls are blocked; unknown fixture actions fail. No real charts, messages, claims, appointments or account preferences are changed. Reload resets the sample. Use fictional information.

To start it again from `frontend/`:

```sh
npm run dev -- --host 127.0.0.1 --port 5185 --strictPort
```

## Trial with actual practice records

Deploy the application and backend changes through the normal test release process. Migration **1786_school_appointment_transition.sql** was applied and verified for the live trial on November 11, 2026. The application release is tracked in [LIVE_TRIAL_2026-11-11.md](LIVE_TRIAL_2026-11-11.md); do not repeat or force that migration. The existing clinical schema must support historical plan effective dates. Old schema is rejected before saving a plan with a substituted date.

1. Choose the practice and provider. Use **Import providers** if needed.
2. Pick an existing caseload client, or use **Add or find a client**. Search before creating. Choose an existing school chart even if demographics are incomplete. Reviewed updates retain its chart ID, enrollment, guardians and history. Archived or uncertain identities need review; same-initials collisions cannot silently reuse a chart.
3. Paste demographics and contacts. Inspect current versus incoming values, choose fields and contact matches, then confirm and save. Unrecognized contact lines need manual correction. Contact import does not invite guardians or enable reminders.
4. Paste primary/secondary insurance. Review payer, policy, subscriber and patient identity. Saving leaves coverage unverified and does not trigger eligibility, claim submission or new patient charges.
5. Paste the original intake and latest plan, and enter the original dates and authors. Saving retains unsigned historical drafts and raw source text. Exact retries reuse those drafts; finalized or unrelated intakes and other imported versions are not overwritten. Clinical approval/signatures remain in the existing chart. Each source paste is limited to 48 KB.
6. Select a client-specific medical PDF up to **256 MB and 5,000 pages**. Files up to 24 MB are retained unchanged; larger files are split by complete pages into volumes below the existing 25 MB upload limit. Review the client identity, then save. A manifest records original filename/bytes/pages/source checksum and ordered volume page ranges/checksums. Open/download every volume before marking the history checked. Retain the original export for PDF digital signatures or embedded attachments; split volumes retain page contents. A single page above the limit needs a smaller export. There is no automatic historical-session extraction in this trial.
7. For school sessions, enable the provider through the existing **Provider scheduling & rollout** control, then open **School appointment connection**. Choose the assigned school and reviewed effective date. Save planning slots where needed. A timed slot becomes a booked session through **Book weekly sessions**, a reviewed agenda import, or linking an existing appointment; editing planning alone does not create a session.
8. Open **Weekly agenda**. Set the actual Monday/week, timezone, service, location, care setting and optional recurrence count. Paste tab-separated or `|` columns: weekday/date, start, end, client. Use explicit AM/PM on each time or 24-hour time. Resolve client and school-slot matches, review conflicts, then confirm creation. Existing matching appointments are reused. The confirmation explicitly uses normal appointment notifications. Office room reservations still use Office Scheduling.
9. Check the provider calendar and the school’s dated booked-week view. School time edits move **one actual occurrence**. Provider recurring edits use the existing calendar editor; their canonical dates/times appear in the school view after refresh. Regular staffing hours, assigned-day templates and capacity changes still need explicit review.

## Retry and review boundaries

- Successful row/step reminders in the workbench are held in memory. Saved canonical charts, contacts, coverage, drafts, documents and appointments persist. After reload, select the same chart; do not create another because a progress label reset.
- Agenda source identities and advisory locks protect repeated/concurrent imports. Expired or changed previews require a fresh review. Partial failures report saved appointment IDs; retry the same input.
- PDF uploads resume existing volumes. The server serializes client archive uploads, checks stored volume identity/content metadata and reuses a matching document instead of duplicating it. Verify completeness by opening/downloading, not by trusting an upload count alone.
- Linked planning stays suppressed after a canceled or moved occurrence. Deleting old planning does not delete canonical appointment history. Past/signed/protected records and stale schedule edits are rejected by the existing scheduling services.
- Source-EHR access remains necessary for any history whose archive/fallback is still pending. This workspace is ready for a supervised trial; source-export compatibility, actual storage/vendor behavior, reminders and a real practice rehearsal remain acceptance work.

## Validation commands

From the repository root:

```sh
NODE_OPTIONS=--experimental-sqlite node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.auricwell-transition.config.js
cd frontend
node node_modules/vitest/vitest.mjs run --config vitest.auricwell-transition.config.js
node scripts/verify-auricwell-transition.mjs
```

The browser command uses installed Chrome and refuses to run without the fictional-preview banner. It checks existing-school-chart enrichment, contacts, insurance, PDF/manifest storage, agenda booking, linked school occurrence edits, mobile overflow and zero real API requests. Backend opt-in native MySQL fixtures were run on an isolated loopback server with synthetic schemas; that server and its data directory were removed. Do not point those fixtures at the application database.

Application entries were production-bundled to a temporary directory without copying public media or running unrelated site generators. That validates the code bundles, not a complete deployment package. Existing large-chunk warnings remain.

Final local results: **107 backend and 68 frontend checks passed** in the repository runner configurations above. The 11 opt-in native MySQL checks passed separately against the disposable server. The same browser walkthrough passed against both development source and the compiled sample bundle. The synthetic checks changed no live client records, messages or claims. Production schema preparation is recorded in the live-trial release note. Temporary production bundles and test database storage were removed; the local preview server remains running for the trial.
