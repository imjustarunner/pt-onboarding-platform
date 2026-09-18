# Personal sessions and authenticator verification

Status: implemented locally; not deployed. Production still needs the migration, a dedicated encryption secret, and end-to-end acceptance checks. Existing incident-evidence rollout gates also apply.

## User experience

Every signed-in users-table account has a **Security & sign-in activity** link, including school staff. The direct `/account-security` screen is accessible independently of tenant navigation, pending school waivers, and password-rotation redirects. It always uses the current authenticated account; administrators cannot change its user ID to inspect someone else's security settings.

For staff roles other than school staff, the screen supports Google Authenticator, Microsoft Authenticator, and other RFC 6238-compatible apps. It generates the QR code locally; no third-party QR service receives the secret. Enrollment requires confirmation of the current password or a Google OAuth sign-in within five minutes, followed by a valid authenticator code. Setup expires after ten minutes and is bound to the initiating session.

Suggested staff-facing wording:

> To protect client privacy, set up two-step verification to view full names and open client documents. You can keep using client codes and initials.

Ten one-use recovery codes are displayed only after successful enrollment. They can be downloaded explicitly by the account owner. Replacing an authenticator requires primary verification plus a current authenticator code or unused recovery code. Replacement ends all app JWT sessions, revokes remembered devices and requires enrollment again. If both the authenticator and recovery codes are lost, IT must verify identity through a separate recovery process; there is no insecure email-only bypass or self-service reset without proof.

Remembering a device is unchecked by default. It requires an explicit personal-device acknowledgement and expires after 30 days by default. The UI says to leave it unchecked on shared school/public computers. The remembered token is a separate HttpOnly cookie; only its hash is stored in the database. It is account-bound and invalidated by expiry, forgetting, factor replacement, password/temporary-password changes, or an administrative end-all-sessions cutoff. Remembering is not a guarantee against a compromised browser or stolen cookies.

## School-staff email verification

School staff can request a six-digit code at Security & sign-in activity. Delivery
uses only `users.email` from the database, never an address supplied in the request.
The screen shows a masked destination. An invalid or inaccessible address requires
IT assistance; users cannot substitute a recipient through the code endpoint.

Codes expire after ten minutes and work once, only in the requesting session.
Codes are stored as keyed hashes, not plaintext, and do not enter communication-body
archives. The direct Workspace transport refuses test-inbox redirection or copied
recipients for security codes. Sending is limited to one attempt per minute and
five per hour per account; five failed guesses lock code entry and resending for
15 minutes. Resending does not clear failed guesses. Provider failures do not
verify the session and do not expose provider error payloads.

Email verification lasts for the current app sign-in, without the authenticator
flow's 30-day remembered-browser option. Password resets, administrative revocation,
and changes to the account email invalidate the proof. Promotion to another staff
role requires authenticator verification; email proof cannot satisfy that role's
policy. An existing authenticator can still verify school staff. Designated privacy
reviewers need a fresh authenticator code for approvals, even if they are school staff.

Email verification is weaker than an independent authenticator when the mailbox is
compromised; it is not phishing-resistant MFA. No automatic suspicious-activity email
challenge or emailed authenticator-recovery bypass is introduced.

## Enforcement and intentional limitations

The policy applies to all configured staff roles, including administrators. School staff use email verification; other staff use authenticator verification. The legacy `MFA_CLIENT_ACCESS_SCOPE=school_staff` override no longer exempts other staff. Parent/guardian and client role policy is unchanged pending scope clarification. `MFA_REMEMBER_DAYS` supports 0, 7 or 30 (default 30). An enrolled factor alone never grants access: the active session must have a verified proof or a valid remembered device.

The enforcement is deliberately conservative: authenticated staff requests require verification unless explicitly reviewed as account access or a limited roster. This also restricts other protected tools (for example, communications, exports, search and administrative views), because those can carry client names in messages, filenames or free text. It is not merely a full-name toggle or PDF-extension filter. Enrollment, personal security history, logout, password change and core account/organization access remain available. Review the remaining navigation/data dependencies with real staff roles before rollout; do not blindly exempt a route to fix a UI error.

School roster responses use an explicit server-side allowlist for identifiers, initials/codes and limited status fields. They omit full names, search terms, notes, guardian details and document links. This avoids shipping hidden names to the browser. The school **Show full names** button directs an unverified user to account security. Quick View PINs are not accepted as this second factor; staff using that shortcut must use a full account sign-in for protected content.

Existing role, organization, client and document authorization still runs after MFA. MFA never expands those permissions. Guardian/client/public intake flows are not converted into staff accounts by this policy. Previously downloaded documents and previously issued storage links cannot be recalled by MFA; existing links remain valid until expiry or separate storage containment. Public information remains public.

Authenticator codes are not phishing-resistant. A fake sign-in page can relay a code, and a verified session can be stolen. Passkeys/security keys should be a subsequent option. References: [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html), [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [OTPAuth](https://github.com/hectorm/otpauth).

## Session history and evidence

New session issuance durably records its signed issuance time, expiry, account, one-way session reference, browser claim and IP provenance before the login cookie is sent. Older active sessions are recognized on authenticated use without resetting their idle timer. Personal history combines these records with earlier platform-session ledger entries. It paginates without a fixed date cutoff.

The user can inspect their own evidence events and end their own active sessions. End-session controls and event queries bind to the authenticated user ID, never a request body/query user ID. History distinguishes recorded logout/revocation from inferred deadline expiry and historical sessions with no confirmed ending. Browser close, device shutdown and network loss do not reliably send logout events. Historical gaps cannot be reconstructed. Activity lists contain safe route/action/outcome metadata, not request bodies or clinical content.

Remembered devices and app sign-ins are separate: ending one app session does not itself forget the device. **Forget this device** removes proofs based on that remembered device. Administrative **End all app sessions** also revokes remembered-device records.

## Deployment and verification

1. Apply migration 1458 after 1452 and 1456, and migration 1463 for school email verification; preserve all existing session/evidence rows. Test on the production MySQL 8 version before rollout. No production database was changed during development.
2. Provision `MFA_ENCRYPTION_KEY_BASE64` as a dedicated random 32-byte key in Secret Manager, grant only the runtime access it needs, and mount it through the existing deployment secret mechanism. Do not put it in source, a PR, or console output. Preserve the key in the organization's secured recovery process; losing it invalidates enrolled authenticator secrets. Key rotation needs an explicit re-encryption process; do not simply replace the key.
3. Startup refuses to load the app if the new tables/columns or key are missing. Roll out the secret and schema before directing traffic to the new build.
4. In a synthetic tenant, verify password and Google sign-in, setup/recovery/remembered-device flows, password reset, session timeout/logout, and revoked sessions across browser tabs and backend instances. Check cross-origin cookie behavior for each production hostname and the native app. A remembered cookie may be unavailable under browser third-party-cookie restrictions; that must require a code rather than bypass verification.
5. Confirm school staff can still open their limited roster, can always open account security, and cannot obtain full names via alternate search/export/detail APIs or open protected documents without verification. Confirm legitimate verified staff retain their existing role restrictions. Check admin, provider, guardian, public intake and Quick View paths separately.
6. Announce the change to staff and provide a verified IT recovery process before enforcement goes live. No staff messages were sent by this work.

Local verification includes encrypted-secret integrity/account binding, OTP replay and stale-code rejection, attempt limits, concurrent recovery-code consumption, device/account binding, password-change invalidation, factor replacement, history/legacy end-state handling, and cross-account inspection/revocation denial. Production routing, device cookies, operational recovery and real-user navigation are not certified by local tests.

September 16 verification initially passed 76 backend and 10 frontend checks across the evidence and account-security suites. The production frontend build passed. Synthetic desktop and 390-pixel mobile previews had no browser errors or page overflow. The expanded suite subsequently passed all 99 backend checks on isolated upstream MySQL 8.0.44; Cloud SQL runtime/configuration acceptance remains pending. See the activity-protection document for the current combined results.

Additional local controls now enforce volume limits and reviewed file-access requests. See [activity protection](activity-protection.md) for scope, defaults, limitations and rollout prerequisites.

September 17 school-email verification: 116 backend security checks passed on
isolated MySQL 8.0.44, and 19 frontend checks passed. All test deliveries were mocked;
no real codes or staff messages were sent. The frontend production build also passed.

Subsequent startup repair on September 17: applied only migration
`1463_school_email_verification` to the configured `onboarding_stage` database.
Both additive table-creation statements succeeded. `npm run check-security`
then passed against that database, including the schema, triggers, MFA key
configuration, and proxy configuration. The backend process still needs a restart
if its file watcher is waiting after the earlier startup failure. No application
deployment or real email-delivery test was performed; production acceptance remains
outstanding.

## Session-check display repair — September 17

Session-settings hydration previously called a forced tracker restart, clearing the
confirmed policy and showing a temporary “Session Locked” overlay with a zero
countdown. Refreshes within the same user/session now keep the existing state and
deadlines while fetching policy; overlapping refreshes share a request. A different
login still starts a fresh verification, and expired sessions and PIN locks remain
enforced. Initial verification is labeled “Checking sign-in,” without an invented
logout countdown. Regression checks cover transient refresh failures, real PIN
locks, concurrent refreshes, new-login races, and unchanged timeout deadlines.

Final pre-commit verification: 116 backend security checks on isolated MySQL 8.0.44,
43 frontend security/session checks, four deployment-secret checks, and the
production frontend build passed. Unrelated family and website changes are excluded
from the security commit.
