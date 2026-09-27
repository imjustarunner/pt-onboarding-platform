# Messaging access and onboarding activation — September 26, 2026

## Confirmed account issue

Paige Tayloe (user 1185, ITSCO agency 2) had an enabled provider account, a configured private Google Group mailbox, and `canUseChat: true`, but lifecycle status `ONBOARDING`. The dashboard intentionally withholds employee sections while onboarding is incomplete. Her mailbox already contained 31 messages across 15 stored conversations. The earlier email fixes were deployed: both Cloud Run services were serving commit `40bc2969`, which includes `45ed58d8`.

The user clarified that onboarding must use the personal hire portal; staff should prepare their password only after completing the required onboarding work, then enter the employee app after activation. A proposed change making Messages available during onboarding was withdrawn before commit.

Paige has four completed task records and no record in the newer `hire_journeys` table. These facts establish a lifecycle mismatch, but do not establish the precise historical cause of her first login.

## Explicitly approved account correction

The user approved activating Paige immediately. A scoped transaction changed only her lifecycle status from `ONBOARDING` to `ACTIVE_EMPLOYEE`, verified her identity and active ITSCO membership, and recorded `user_status_changed` in `user_activity_log` with actor 501 and the explicit instruction. Password/login flags, task records, and onboarding completion timestamps were preserved. No completed journey was fabricated and no email was sent.

Afterward, the real conversation list, ownership check, and reader service successfully opened all 14 currently visible conversations with `markRead: false`. Her existing sign-in remains valid; refresh the account data or sign out and back in to refresh dashboard permissions. No other enabled group-password accounts with prepared passwords remained in `ONBOARDING` at the time of this audit.

## Code correction

- Password preparation is the final required onboarding step before final review/submission. The UI waits for completed prerequisites; the service checks persisted required tasks, clinical profile, handbook acknowledgements, and configured resources before changing the password.
- A prepared password or SSO override no longer permits a pending group hire into the staff app. `ACTIVE_EMPLOYEE` activation remains a separate People Operations action.
- Existing authenticated sessions and Quick View sessions check the current lifecycle state, preventing old sessions from bypassing activation. Personal portal access and People Operations messaging remain available during onboarding.
- Legacy training-only logins, approved-employee sessions, and authorized demo sessions retain their separate behavior. This does not automatically promote or deactivate other staff.

## Validation

483 tests passed: hiring/onboarding (196), messaging (196), session security (17), Quick View (12), password recovery (59), and candidate password UI (3). The modified Vue component compiles, and the live read-only Paige conversation checks passed. No real test messages were sent.

Grasshopper permission management is not integrated with this application. The app contains a Grasshopper login entry for Paige but no saved extension; that does not establish whether Grasshopper has assigned her SMS permissions. Her Grasshopper texting request remains unverified.

The account correction is live. Code rollout should be checked separately after the commit is pushed.
