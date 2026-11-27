# Eligibility deductible periods — release handoff

**Awaiting the separate release chat. Not deployed.**

Branch: `codex/eligibility-benefit-periods-20261126`.
Base: `8b51a4cd34227d4e6a4a239d60d66970933b09c4` (`origin/main` when implementation started).
The implementation chat supplies the final full commit SHA.

## Changes

The client Billing/Insurance benefits view and verification history now show a dedicated **Deductible period and reset** summary, using the retained Claim.MD response.

- A payer-classified calendar year uses the verification's **date of service**, rather than today's year, to show the expected January 1 reset.
- A payer-classified service year with complete, consistent full-year dates can show a non-calendar expected reset. Incomplete or ambiguous annual boundaries remain unknown.
- Coverage effective dates and benefit-validity dates stay separate from deductible accounting. A benefit effective several years ago does not determine this year's deductible start. If returned benefits end sooner, the view calls for an earlier refresh.
- Contract dates, remaining amounts, YTD values, and out-of-pocket rows do not by themselves establish an annual deductible reset. Missing, contradictory, invalid, or out-of-scope dates are shown for billing review rather than guessed.
- Context stays separate by returned member, service, network, individual/family level, and primary/secondary verification. Other-payer findings do not become this policy's deductible year. Repeated matching rows are deduplicated while retaining source links.
- The summary includes expected reset and refresh-before dates, source check/date, and payer conditions. Long findings initially show four periods with an explicit expansion control.
- Older retained responses are projected on read, without another paid inquiry or rewriting their encrypted evidence. New checks include the projection in their ordinary saved summary. Existing policy-import behavior, identity checks, provider financial-visibility restrictions, and collection rules remain in place.

These are **expected** period boundaries from payer evidence, not final amounts owed or a guarantee of renewed coverage. This change adds a refresh reminder in the view; it does not schedule additional paid checks or change card-collection timing.

The period-code interpretation follows the official [Claim.MD eligibility reference](https://www.claim.md/eligibility_code_reference.pdf), including Calendar Year (23), Service Year (22), Contract (25), and Remaining (29).

## Validation

Final results: **zero failures**. Counts overlap across suites.

| Suite | Passed | Skipped |
| --- | ---: | ---: |
| `backend/vitest.insurance-verification.config.js` | 180 | 1 |
| `frontend/vitest.insurance-verification.config.js` | 101 | 0 |
| `backend/vitest.claimmd.config.js` | 662 | 4 |

The five environment-gated MySQL cases were not run: eligibility automation settings, claim review snapshot, assignment coverage review, Claim.MD data monitor, and planned-claim import. This task adds no SQL queries or schema changes. Tests cover calendar/fiscal periods, leap-day ambiguity, invalid/contradictory ranges, distinct member/network/level scopes, remaining/YTD isolation, conditions, duplicate source rows, historic SQL DATE values, immutable saved evidence, and one-request behavior across agencies. Existing financial-visibility component tests also pass.

`git diff --check` passed. No large production frontend build or live application verification was performed in the sparse task checkout.

## Release requirements

- **No migration, backfill, new dependency, secret, or configuration is required.** Existing encrypted eligibility evidence is reused.
- The release chat integrates with the latest released code and builds/deploys the paired backend/frontend release. The frontend tolerates a missing `deductiblePeriods` field, but the new summary requires the updated backend for dates.
- Verify live using authorized application access: a calendar-year response, a complete non-calendar service year, unknown/contradictory dates, historical verification dates, primary versus secondary contexts, and provider-only financial restrictions. Opening old results must not generate an additional eligibility inquiry.
- No production data, application sessions, human superadmin identity, deployment workflow, or deployment was used by this implementation chat. Temporary task checkout and reproducible reports are removed after the branch is retained and pushed.
