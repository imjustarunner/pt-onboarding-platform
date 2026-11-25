# Cancellation sender, branding, replacement dates, and sole-reviewer recovery

Branch: `codex/agency-cancellation-mailboxes-20261124`.
Implementation base: `0767593d37350f7bbb72c59bff66242932c633a8`.
Implementation and testing only. No main merge or production deployment from this chat.

## Behavior

- Reviewed day and individual cancellation notices use the owning company's verified, active `messages@` identity, with the actual provider's display name for provider-authored notices and the company's support Reply-To/copy. The sender's active agency membership, signed review, recipient permissions, and tenant identity checks remain enforced. A missing optional private SSO mailbox copy cannot prevent the reviewed notice; no private address is guessed. Ordinary manual email retains its existing mailbox checks.
- Cancellation branding comes from the client's clinical, learning, and school portal context. Ordinary clinical cancellation mail no longer gains SchoolCareBridge branding from the shared sender. Explicit school-office notices still include school coordination. Read-only HTML examples resolve the client from an actor-owned review reference, rather than trusting a browser client ID or school flag. No preview issues receipts or sends mail.
- Existing replacement bookings use ascending start time before the database limit. The browser also sorts by the actual timestamp across timezones. Client history retains its current default order.
- A directly signed-in platform superadministrator who is the sole active designated privacy reviewer can restore their own existing file hold. Recovery requires an explicit work reason, confirmation, and a Google sign-in within five minutes or fresh authenticator verification without a remembered device. The roster is rechecked with transaction locks. The ticket, hold reset, and `sole_reviewer_file_access_recovery` security evidence are committed together; failure to append audit evidence rolls back recovery. Historical alerts and usage remain. Recovery does not release email holds, assign reviewers, or grant unlimited exports. Other self-approvals remain prohibited. The request popup displays the recorded original hold reason when available.

## Read-only production configuration findings

The established Cloud IAM login confirmed that all of these Cloud Identity groups already exist:

- `messages@itsco.health`, `support@itsco.health`
- `messages@nextleveluplcc.com`, `support@nextleveluplcc.com`
- `messages@innerstrengthin.com`, `support@innerstrengthin.com`

Each has the owner as OWNER/MEMBER and the existing automation account as MANAGER/MEMBER. No groups or memberships were changed. This verifies group presence and membership only; SMTP delivery, group posting settings, and application sender records were not live-tested. No application identity was assumed, live hold cleared, or notice resent.

## Validation

All commands run from the isolated worktree; frontend commands use `frontend/` as cwd when specified. Dependencies were reused via symlinks, with no install or production build.

- Backend scheduling configuration: **1,726 passed, 104 skipped**.
  `NODE_OPTIONS=--experimental-sqlite node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.scheduling.config.js`
- Backend family-email configuration: **486 passed, 1 skipped**.
  `NODE_OPTIONS=--experimental-sqlite node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.family-email.config.js`
- Backend security-evidence configuration: **212 passed, 63 skipped**.
  `NODE_OPTIONS=--experimental-sqlite node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.security-evidence.config.js`
- Frontend `vitest.day-cancellation.config.js`: **54 passed**.
- Frontend `vitest.session-reschedule.config.js`: **39 passed**.
- Frontend `vitest.file-review.config.js`: **35 passed**.
- Targeted messaging sender and SSO-copy tests: **33 passed**.
- Broad messaging configuration: **1,371 passed, 6 failed, 42 skipped**. The same six failures reproduced with all three modified messaging services replaced in memory by their implementation-base source: `messaging.access.test.js` (second assigned provider access), `messaging.eventGroups.test.js` (two group-order assertions), and `messaging.recipientDirectory.test.js` (three query/parameter assertions). These pre-existing failures were not modified by this task.
- `git diff --check` passed.

Database integration suites require an isolated `EVIDENCE_TEST_SOCKET` and were skipped locally; no local MySQL server or running Docker daemon was available. Three new MySQL cases cover sole-reviewer restoration, refusal after a second reviewer is added, and audit-failure rollback. Run these in the release validation environment before production rollout.

## Release requirements and verification

No new migrations, secrets, Google groups, or manual data backfill are required. Existing security evidence/activity protection tables (migrations 1456 and 1459) must already be present, as on the base code. Integrate the latest released main in the separate release chat, preserve other released work, rerun affected validation, and release backend and frontend together through the existing main-branch GitHub Actions queues.

Using normal authorized identities, verify:

1. Company-specific cancellation sender and support routing in ITSCO, NLU, and Inner Strength. Verify delivery through a sanctioned test recipient; this chat sent no real cancellation emails.
2. Ordinary clinical mail has no school coordination strip; school-related mail retains it; learning context retains its own branding. Preview and delivery use the correct context.
3. The nearest replacement appointment appears before more distant appointments.
4. Sole-reviewer recovery appears only for the eligible directly signed-in owner, requires fresh verification, resets only the file hold, and records the explicit audit event. With another active reviewer, the exception disappears and the server refuses it.
5. Review prior delivery-uncertain records against transport evidence before any resend. The branch does not automatically retry historical notices.

No live behavior verification or production-completion claim is made by the implementation chat.

## Integrated release validation — November 24

The release branch `codex/release-cancellation-mailboxes-20261124` merges implementation commit `fcdb7983d29f738db162964689714ef005386933` into main `a91ad804abe0306bbc605c07639a1c209d0f31fd`, preserving the newer enrollment/intake and confidential-entry changes. The merge required no conflict resolution or runtime edits.

Repeated against the integrated tree:

- Scheduling: **1,726 passed, 104 skipped**.
- Family email: **486 passed, 1 skipped**.
- Day-cancellation, replacement scheduling and file-review UI: **54 + 39 + 35 passed**.
- Focused sender selection, verified sender, envelope unwrapping, shared portal email and SSO-copy tests: **34 passed**.
- Security evidence, with an isolated socket-only MySQL server: **273 passed, 2 failed, none skipped**. All **32 activity-protection native cases passed**, including the new sole-reviewer restoration, second-reviewer refusal, and audit-failure rollback cases.
- The same two failures reproduced against unchanged main source loaded in memory: the older evidence fixture omits tables now required by the startup storage check, and its exact-IP assertion depends on the event insertion that the preceding failed check prevents. No production security check or unrelated fixture was weakened.
- `git diff --check` and staged whitespace checks passed.

No human application session was assumed and no live file hold was reset. Actual owner recovery requires the eligible owner's own fresh verification. No historical delivery-uncertain notice is automatically retried. No main update or production deployment was performed by this integration task. The separate release chat must publish the backend and frontend together and record matching live build identifiers.

Production configuration was checked with the existing scoped automation service account. The six required schema probes and append-only evidence triggers passed. ITSCO (agency 2), NLU (6), and Inner Strength (377) each have active Messages/Support sender records. All three Messages addresses returned Gmail `verificationStatus: accepted` through the app's normal nonhuman Gmail client. An initial narrower-scope probe could not inspect Gmail settings; the established application client succeeded without changing scopes, identities, credentials or access. Production sender configuration was not modified. Seven existing paired-release/source-preservation/queue guard tests also passed.

Automatic approval review rejected the proposed main push and deployment because this chat's release instructions reserve those actions for a separate release chat. The rejected command did not run. This task therefore retains the integrated changes only on its named branch; actual internal delivery tests and authenticated live owner recovery remain release verification work. No test emails or real cancellation notices were sent.
