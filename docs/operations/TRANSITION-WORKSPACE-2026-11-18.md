# Transition workspace — November 18, 2026

Manage the plan at **https://plottwisthq.com/practice-transition**. The Practice Operations transition card and older EHR Transition settings links lead here. The workspace defaults to ITSCO when the signed-in administrator has an active ITSCO membership. Only authorized ITSCO, Next Level Up and Inner Strength memberships are offered. Company settings and impersonation are not used to switch boards.

## Daily use

1. Open **Groups & clients**. “Bring every provider’s clients up to date” is first.
2. ITSCO groups now contain **active providers with payroll activity only**, ranked automatically in groups of five. The source is the three latest ended pay periods with calculated summaries and status `ran`, `posted`, or `finalized`. The exact period dates appear under **Why providers are in this order**. Rank by summed direct payroll credits/hours, then total credits/hours, imported service entries, payroll units and provider ID. No app appointment counts or manual count confirmation are used. Providers with zero activity across all measures are excluded. All active staff remain available as responsible owners and trainers.

   Payroll `direct_hours` / `total_hours` store payroll credits/hours, not verified clock hours. Current tier credits are displayed without grace/prior-period inflation. Imported service entries come only from the latest import for each selected period, include in-period service dates, and deduplicate fingerprints. They are supporting workload evidence, not an assertion that each billing-code row is a distinct visit. Earnings, rates, raw client data and payroll payloads are never returned.

   Earlier staff/app-based group order is replaced automatically. If group membership/order changes, its prior ranking, group checklists and handoff evidence are archived in `rankingHistory`; individual provider/client checklists remain. The original append-only audit events remain untouched. New group work must be accepted for the new members. Group writes include a server-generated ranking key and reject stale membership. A normal authenticated save persists the corrected snapshot with its actual actor. Merely viewing the page makes no application-state changes.
3. Choose a provider. Assign their transition owner and date. Existing clients load directly from their practice-scoped caseload, including active secondary assignments and past clients. Each client has separate records and scheduling owners, a due date, a note, and five checkboxes. Final completion requires all preceding client checks. Open the existing chart or the existing import/scheduling workbench; no duplicate client is created by selecting a checklist.
4. Use **Email group / Email** for an editable draft in the existing composer. Use **Schedule / invite this group / Invite** to review recipients and create training or add them to a meeting the coordinator hosts/attends. Date/time, trainer, selected recipients and attendance requirement are reviewed before sending. Existing email queues, personal RSVP links, delivery rules and training attendance behavior apply. Opening the editor sends nothing. Linked meetings show RSVP responses. A saved meeting is retained if linking fails; retry linking rather than recreating it. Uncertain create requests require reviewing existing meetings.
5. Use the group checklist to assign and check shared work. The separate ordered Google → clinical → TherapyNotes → monitored-workday acceptance still controls rollout progression. The next group does not gain acceptance merely because checkboxes were ticked.
6. Use **Practice checklist** for agency-wide records, families, texting, security, billing, backup and subscription work. Labels use plain language. ITSCO and Inner Strength do not display NLU provider-update tasks or totals. Inner Strength has direct scheduling entry points for existing caseloads.
7. Use **Training videos** to add a topic, assign a creator and due date, paste a video/training link, record review and mark it ready. Remove unneeded suggestions; restore them later with their evidence intact. Finishing a video does not mark provider practice/training complete.

## Data and access

- Reuses the encrypted `practice_transition_weeks` payload and append-only `practice_transition_week_events`; no new database migration. Existing tasks, counts, frozen rankings, handoff evidence and video reviews remain.
- New workspace fields hold per-provider, group and provider/client checklists, saved count drafts, custom videos and removed-video IDs. Ordinary legacy saves cannot forge these fields. Completed checks record the authenticated actor and server time.
- All workspace endpoints require an active administrator membership in the exact practice, limited to agencies 2, 6 and 377. Client writes recheck current practice and caseload. Owners must be active staff in that practice. Private meetings and interviews are not exposed by the picker.
- Stale revisions return 409 without overwriting another person's work. Failed saves leave the local form open. Save before switching practice, provider or group; browser navigation warns about unsaved work.
- No messages, real meetings, chart exports, clinical attestations, payroll changes, credentials, Google access changes, subscription cancellations or ERA transfers are performed by this release itself.

## Validation

- Targeted transition backend/policy/access tests and frontend interaction/navigation tests.
- Native disposable MySQL tests for scoped staff/count/caseload reads, the last three completed periods, latest-import deduplication, encrypted persistence, append-only attribution, cross-practice rejection, concurrent writes, complete-roster ranking and private-meeting exclusion; existing transition/consent transaction coverage retained.
- Production-compiled fictional browser rehearsal of the standalone page at 1440px and 390px: ITSCO default; named five/five/one groups; automatic payroll order; separate client owners; saved checklist; invitations; RSVP; add/remove videos; practice switching; no horizontal overflow.
- Rehearsal makes zero real application API requests and sends zero real emails. It is not authenticated live-recipient acceptance.
- Live names and workload totals are sourced by the normal signed-in request from practice payroll. Payroll source correctness is not established by synthetic tests. The release does not falsely assert source exports, recordings, individual migrations or cancellations are completed.

Commands:

```sh
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.transition-week.config.js
node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.transition-week.config.js
TRANSITION_WEEK_TEST_MYSQL_PORT=<disposable-loopback-port> node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.transition-week-mysql.config.js
node frontend/scripts/verify-transition-workspace.mjs --out <evidence-folder>
```
