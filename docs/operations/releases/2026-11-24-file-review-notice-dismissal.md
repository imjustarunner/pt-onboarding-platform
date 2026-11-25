# Hide file-access review notifications without changing the review

Branch: `codex/file-review-notice-dismiss-20261124`.
Parent implementation: `fcdb7983d29f738db162964689714ef005386933` on `codex/agency-cancellation-mailboxes-20261124`.

The November 24 evening screenshot still showed a pending file-access review card with no presentation-only close action. At investigation, shared `origin/main` (`ecbcbf677`) retained the older component and did not contain the parent owner-recovery commit. This chat did not deploy, assume an application identity, or clear the live hold.

## Change

- Every file-review notification has a visible Hide button and a direct Review queue link.
- Hide removes only the overlay. It never submits a review decision, resolves the ticket, resets a hold, or changes audit evidence.
- Hidden request IDs are remembered in tab session storage under the signed-in reviewer's ID, surviving polling, refresh, and component remount in that tab. Names, reasons, and document information are not stored.
- New request IDs remain visible. Storage failure still permits immediate hiding for the current mounted view.
- Switching accounts resets local notice state and ignores an older account's in-flight queue response.
- The underlying request remains available through Security / the privacy review queue. The parent commit supplies the eligible sole-owner recovery workflow; hiding the notice is separate from restoring file access.

## Validation

`node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.file-review.config.js --silent --reporter=dot`

**39 passed, 4 test files passed.** Covers hiding without a mutation, polling/remount persistence, new requests, account isolation, unavailable storage, existing review actions, owner recovery, and security notices.

`git diff --check` passed. No package install, dependency duplication, or large build was needed.

## Release handoff

Implementation and testing only. Do not infer production deployment from this branch push.

This follow-up is frontend-only and requires no migration, secret, or live data edit. Its branch includes the parent recovery implementation. The separate release chat should integrate the parent commit plus this follow-up with the latest released main, preserve unrelated changes, run required checks, and use the existing shared GitHub Actions main-branch release queues. The parent recovery change needs backend and frontend released together.

After release, verify that Hide immediately clears the visible overlay, refresh/polling does not reopen that same request in the tab, the ticket remains in the review queue, and any file-hold restoration still goes through the authorized fresh-verification recovery flow.
