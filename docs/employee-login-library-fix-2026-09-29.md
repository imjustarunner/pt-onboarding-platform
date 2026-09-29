# Employee sign-in and Library access — September 29, 2026

## Findings and changes

- ITSCO had `googleSsoEnabled: false` while retaining its required Google staff roles. Normal identity discovery therefore selected password login. A successful Google callback was recorded for the reported provider; the quoted temporary-password error is emitted only by password login when both password hashes are absent.
- Of 28 active accounts missing both app-password hashes, four were demo accounts. Twenty-three real accounts had successful Google sign-in history; the remaining real account was verified in Google Directory. The reported provider also has an active Google Directory user.
- Restore ITSCO's existing Google policy by changing only `googleSsoEnabled` to true. Preserve the reported provider's requested password login using the existing per-user password exception; do not change passwords. Apply this after the code release. Existing explicit password exceptions remain intact.
- Group-email and demo accounts now consistently bypass mandatory Google routing and remain eligible for password recovery. Email, username, and phone lookup paths carry the fields needed for this decision. No authentication verification or tenant-membership checks are removed.
- Library routes already obtain current database-backed capabilities through `requireCapability`. The controller mistakenly recalculated them from a session identity without employment status. It now uses the server-resolved capabilities, preserving organization membership checks, resource sharing, and management permissions.

## Verification

- 105 authentication, recovery, and Library controller regression tests passed.
- Seven Library document rendering/permission tests passed with `NODE_ENV=test` (no database startup probe).
- Read-only checks of the corrected Library recent-resources path returned HTTP-equivalent 200 results for actual provider, CPA, and group-email employee records.
- The preceding virtual-hours and hiring-resume commit is included in this release, with its 235 passing tests and production frontend build. Twenty-one optional MySQL scheduling integration tests require their separate fixture environment and remain skipped.

The historical logs do not establish why the tenant Google switch was disabled or the exact browser steps between the successful Google session and the password error.
