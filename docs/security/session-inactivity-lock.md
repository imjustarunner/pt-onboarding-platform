# Inactivity lock and logout

## Agency setting

Agency Management → General → Session Timeout (Timedown) → **Require Quick View passcode to unlock**.

Select the roles that must use their existing six-digit Quick View passcode. This overrides the optional four-digit session PIN preference. A user without a Quick View passcode must fully sign in and configure/reset it in My Preferences; a missing code does not disable the requirement.

The strictest timeouts and passcode requirement across active agency memberships apply to the whole login. Superadmins can access all agencies, so all active agencies participate in their policy. Admin/support/CPA/superadmin idle and countdown durations are capped at ten minutes each; shorter agency settings apply. Other users default to three minutes idle and ten minutes countdown. Platform and personal session-lock limits can shorten the idle interval.

## Behavior

- A server-confirmed idle deadline covers the screen and changes presence/session accounting to timedown (signed in but inactive).
- The logout deadline is absolute. Background tabs, computer sleep, reloads, focus and incidental mouse movement never grant more time.
- Real interaction renews active sessions. While locked, explicit resume is required; selected roles must supply the code. Successful resume/unlock and expiry synchronize between tabs of the same browser login. Separate demo windows keep their UI state isolated.
- API middleware rejects client-data access while locked and rejects expired/revoked sessions. Recovery routes are explicitly allowed. General API traffic and presence/ledger polling never renew the security clock.
- Verification uses the current user's bcrypt Quick View hash. Attempts serialize in a database transaction and share the existing Quick View lockout counter. Three failed session-unlock attempts revoke that login. A correct code submitted after expiry cannot restore it.
- Away status and payroll clock-in do not pause the security deadline. Visible live meetings count as ongoing use; hidden meeting tabs cannot suspend the deadline indefinitely. Timeout cleanup preserves automatic payroll clock-out, using the actual expiration time when observed after sleep.
- Policy reads are cached for at most 30 seconds per API instance. Unlock/config requests read fresh policy. Updated policies apply to subsequent requests; the frontend refreshes policy on focus and agency configuration changes.
- Browser cookies/tokens remain necessary for unlock. The six-digit code does not replace full sign-in after logout.
- A new tab stays covered until its initial session check succeeds. Transient failures retry every five seconds while visible, respecting API rate-limit backoff and the original 60-second recovery countdown. Missing session data is a failed verification, and an earlier tab-initialization request cannot start a countdown for a newer initialization. Retries do not renew activity or bypass a required PIN.
- Website editing links use in-app navigation in the current tab, preserving the verified session when opening the marketing editor. Opening an editor URL directly still performs the initial session check.

## Deploy

1. Apply `database/migrations/1452_auth_session_security.sql` using the existing migration runner.
2. Deploy the API and frontend together; have existing tabs reload/sign in. Old frontend builds do not send the new activity acknowledgements and will time out under the new API.
3. Enable the passcode requirement for the desired roles and confirm that those users have configured their Quick View code.
4. Smoke-test two tabs with a synthetic test user: lock both, unlock one, check both resume, then hide/sleep past expiry and verify a full sign-in is required. Confirm API client-data requests return 423 while locked and 401 after expiry, and verify the presence/session ledger.

Missing security storage fails closed. This migration has not been applied to a live database as part of the code change. Existing JWTs initialize their security clock from issuance, so older sessions may require sign-in on rollout.

The server rejects an expired session whenever it is presented, even if the browser is suspended. Ledger/presence/payroll cleanup runs when expiry is observed by a request or logout; there is no new scheduled cleanup job. Existing per-session revocation rows should be retained at least until the JWT's absolute expiry.

## Validation

```sh
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.session-security.config.js
npm --prefix frontend test -- --run src/store/__tests__/sessionLock.test.js src/utils/__tests__/activityTracker.test.js src/utils/__tests__/sessionDeadline.test.js src/components/__tests__/SessionLockScreen.test.js
cd frontend
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

Tests cover policy precedence, admin role normalization/caps, locked API route restrictions, failed attempts and revocation, expiry during code verification, hidden/sleeping tabs, reload persistence, cross-tab resume, code input and failed unlock behavior. Tests use synthetic sessions and mocked database/API boundaries; they do not replace a deployed database/browser smoke test.

Design reference: [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), server-enforced idle/absolute expiry and invalidation.
