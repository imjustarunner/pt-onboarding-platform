# AuricWell Secure Session Comments

Each comment belongs to one canonical appointment and one client. Each author has one comment there, limited to250 Unicode code points after trimming. Authors can edit their own comment; the interface shows **Edited** and the edit date/time. A concurrent edit requires reloading and reviewing the saved version. Longer communication uses secure messages.

Before sending, the interface shows the server-verified audience. Provider, guardian and client posts automatically include every currently eligible family portal user for this child, plus the appropriate assigned provider. Eligibility uses existing relationship and clinical-message permissions. This feature does not grant rights, change custody or waive an access review.

Comments are encrypted using the existing versioned chat keyring. Ciphertext envelopes bind the agency, appointment, child, author and revision. Each revision retains an immutable audience and encrypted audit history. A newly eligible family member cannot read older messages/comments. If the author edits an earlier comment, its updated version reaches the current eligible audience; earlier versions remain inaccessible to newly added people. No public revision-history API exposes previous bodies. Ordinary secure message conversations start a new immutable conversation when their audience changes; old private conversations are read-only and preserve original access.

The first shared portal send requires a persistent versioned acknowledgment covering encrypted versus private communication, the full family audience, private scheduled sessions for unshared concerns, and the fact that messages/comments are neither therapy nor a substitute for sessions. Ordinary individual email is separate and remains available. Acknowledging the notice grants no access.

Read receipts require the exact displayed version. Opening a list, a notification or an anonymous email link is not a read receipt. Comments stay attached to past and future sessions and appear in authorized communication history with authenticated schedule links. App lock, logout and account/workspace changes clear decrypted UI state and invalidate delayed responses.

Providers receive generic branded email notifications without comment text or patient/session details. The morning reminder is due at07:00 in the schedule's local timezone, uses an idempotent recipient/agency/day key, and respects notification settings. The existing minute worker processes the durable outbox; it creates no new paid service. Current access is checked again before queued email transport. Uncertain transport is not retried automatically. The authenticated today view can display authorized content. Its splash stops after the last eligible appointment is complete or past; past comments remain accessible. Dismiss-today and snooze state never mark comments read; a new revision can re-alert.

Normal browser, standalone EHR and primary authenticated mobile account sessions use the same authorization service. A reusable Quick View PIN cannot access clinical comments. Group appointments require choosing a currently authorized client; one participant's family cannot read another child's comments. School/logistics-only access does not grant clinical comment access.

## Storage and deployment

Apply only the new additive migrations1792,1793 and1794 after their isolated MySQL acceptance tests, before serving the new application version. Do not replay the historical migration backlog. These create comment/revision/audience/outbox/audit tables, versioned acknowledgment evidence and immutable shared conversation mappings. They neither rewrite previous signed documents nor merge/delete clients. Existing encryption key configuration is required; missing keys fail closed.

The public branding assets are byte-identical copies of the owner's supplied button and icon. No confidential material is embedded. My Learning's provider reference uses existing training permissions and does not mark assigned courses complete or create paid training time. Native bundled releases and actual device testing are distinct from deploying the browser application.

## Validation and independent acceptance

Run the dedicated backend comment, native/acknowledgment, family-history and connected-mobile suites, plus frontend comment, native and provider-training suites. The SQL suites require the explicit disposable loopback database; they never use DB_* production defaults. Independent live QA must use agency450, controlled testing+ recipients, legitimately eligible relationships and correctly assigned providers. An unreviewed clinical grant must stay restricted rather than being bypassed to make the test pass.

The release packet retains actual checks separately from NOT_RUN, fixture/device blocks and source-level tests. Synthetic previews in training are labeled as such. Actual inbox receipt, a real07:00 reminder run, physical iPhone Safari/native behavior and independent browser acceptance cannot be inferred from unit tests or narrow desktop screenshots.
