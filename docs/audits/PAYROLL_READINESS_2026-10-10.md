# ITSCO payroll transition audit — October 10, 2026

**Result: not ready for automatic activation.** This is a configuration and code audit, not a completed payroll rehearsal or approval to issue payments. The initial audit used read-only transactions. The later authorized setup preparation is recorded below; no new rates were activated and no payroll was run or posted.

## Follow-up: clarify and prepare the priority items

- Saved October 10 as the planned service start for 30 active assignments that had no date. All 38 assigned active staff now have the planned date. The agency and employee activation flags remain off. Prior values were backed up privately before the transaction.
- Initialized the remaining missing leave record. All 48 active internal accounts now have a record; this includes nonparticipants/system accounts and is not a claim that 48 people move to service pay. New balances remain unreconciled; no ADP handoff or sick-rate amount was invented.
- Rechecked production configuration after preparation: 38 assigned, 0 enabled, 0 executed amendments, 48 leave records, 0 confirmed Training PTO handoffs. Signature, salary-exception and handoff reviews remain outstanding.
- Added a private plain-language report with a label on every employee value, saved amendment sick rates, definitions and UI instructions. `missing` no longer stands alone without explaining the field/action. Use `--report-path=/private/tmp/<new-report>.txt` with the audit script; it creates a mode-0600 file and refuses to overwrite an existing path.
- The user subsequently authorized implementation and testing of the payroll safeguards. They are implemented locally and tested; publishing remains separate. No live payroll run or activation was performed.

## Confirmed operational handoff and safeguards

- Payroll processed October 12 covers September 26–October 9 and remains on old terms. The next payroll covers October 10–23 under the applicable executed new agreements. Downloaded reports may contain old dollar amounts; those amounts are not authority to override signed new rates for new service dates.
- The individual salary transition confirmed by the user is salary through October 10 and new service terms from October 11. Those dates were saved with a private backup. The mixed salary/service period still needs a reviewed split before it can run; the safeguard prevents a residual salary from suppressing service pay. No salary amount or historical salary period was changed.
- Created high-priority Training PTO reconciliation and ADP tracking-retirement tasks, due October 22 and 23 respectively. ADP retirement is conditional on verification of the opening-balance handoff; history and earned balances must be retained. This assigns the work, not a claim that ADP has already been changed. The two administrative salary questions were deferred by the user.
- Go activation now locks and validates the selected active employees, matching executed agreements, rate-profile presence, period state and salary overlap. Employee writes, pending-row removal and agency activation commit together. Explicit opt-outs and later individual dates are preserved; inactive staff are not enrolled by the bulk operation.
- Earlier periods exit the new-pay path before checking the new profile or signatures. New periods stop on missing/mismatched signed terms or profiles, unresolved salary splits, incomplete or invalid dated units, and aggregate shift hours without dated provenance. Prior-date work requires historical-rate review; the current matrix is no longer substituted as its historical profile.
- A failed new-pay calculation invalidates the run's posting/export gate instead of silently saving a fallback calculation. The period must be successfully recalculated before posting/exporting.
- Validation: 127 focused Vitest tests and 18 Node tests pass (145 total). These include old-period protection, re-rating old report amounts for new dates, individual cutover dates, missing signatures, atomic activation failures, carryover-unit mismatches and salary-overlap checks. No production payroll rehearsal or payment was performed.

The production findings below describe the original audit snapshot. The start-date and missing-record counts above supersede those original counts; creating a record does not verify its opening balance or classification.

## Correct service periods

| Purpose | Service dates | ITSCO period | State at audit |
| --- | --- | --- | --- |
| Upcoming processing of earlier work | September 26–October 9 | 146 | Draft; no import or summary |
| Intended new-system period | October 10–23 | 147 | Draft; no import or summary |
| Following service period | October 24–November 6 | 148 | Draft |

October 24 is the next service-period start, not a verified check date. Payroll processing/check dates should not be used as compensation effective dates. Next Level Up is separately disabled and was not activated by this audit.

## Production findings

- The active internal roster contains 48 accounts, including administrative/system accounts. **38 have category/level assignments; all 38 are disabled for the new compensation engine.** The agency engine is also disabled. Thirty assignments have no October 10 activation date; eight do. A saved assignment or amendment alone does not enroll someone.
- All 38 assigned active staff have compensation drafts. None has an executed, countersigned amendment. There are 39 such drafts overall, including one outside the active roster. The effective-agreement resolver uses the later of the agreement date and countersignature date, so a later signature does not automatically activate October 10 terms retroactively.
- Forty-six of the 48 active accounts have leave accounts. **No active account has a confirmed Training PTO ADP handoff.** Nonparticipant/system accounts need a documented exception rather than invented opening balances. People Operations must reconcile participating employees through the prior period, including that period's accrual, and confirm the October 9 handoff after that period is posted. Existing balances must not simply be assumed current.
- The school benefit is enabled with accrual after October 9, a 20-hour cap, and a fallback support rate of $18/hour. The shared accrual code waits for posted payroll and uses idempotent per-period/per-bucket records. Training uses 0.25 hours per 30 qualifying hours; school support uses 2 per 25. Training waits for the confirmed handoff. Requests deduct balances only when approved and applied.
- One employee assigned to the new matrix still has an overlapping salary with service pay excluded. That salary overrides the new service subtotal. Resolve the individual salary arrangement before enrollment; no salary was changed during the audit.
- Two new staff have no leave account. Several assigned employees retain hourly/salaried classifications, and some have no fallback sick-leave rate. Review those classifications and exceptions rather than applying a blanket FFS conversion. Two employees previously described as salaried have no active salary-position records in this app; confirm whether their payroll remains managed in ADP.
- All 15 category/level rate profiles exist. Saved Spanish differentials are $1 at Tier 2 and $2 at Tier 3. Individual role-pay terms exist in the relevant drafts. Sick-leave calculation tests exclude conditional additions, differentials and supervision pay and use the eligible clinical/direct-care base rate.
- There are 31 submitted time claims dated September 26 onward, none yet assigned a target payroll period. These require review; they are not approved pay.
- Automatic ADP API submission remains an explicit stub. The supported path is the payroll CSV, followed by payroll-processor reconciliation. No ADP API export jobs exist for ITSCO.

The detailed employee-level findings are kept in the private local audit output, not this repository.

## Original software findings and current disposition

1. **Historical service rates:** the unsafe current-matrix fallback and proportional dated-unit scaling are removed locally. Older work now stops for historical-rate review, and mismatched dated units stop for reconciliation. Automatic handling of every historical contract/carryover remains unfinished; mixed pre/post-cutover work still needs review before posting.
2. **Activation and failures:** corrected locally with transactional Go activation, agreement/assignment checks and failure invalidation. These changes still need publishing before the live app benefits from them.
3. **School benefit year end:** no school-support expiration/reset implementation was found in the accrual, account, approval or rollover paths searched. The calendar-year policy needs a dated implementation and year-boundary test before year end. Do not zero balances during this audit.
4. **End-to-end reconciliation:** neither period 146 nor 147 has an import yet. Unit tests do not establish that every real employee, carryover, claim, salary exception and leave amount will reconcile to the processor. A non-posting rehearsal on representative data is still required.

## Corrections included with this audit

- Payroll CSV now derives sick/training hours from the applied payroll snapshot, not submitted leave requests. School support pay remains taxable extra pay and does not become sick-leave hours.
- Exported period dates and filenames correctly normalize database Date objects.
- Added a read-only launch configuration audit and focused regression coverage.
- Corrected an existing submission-window test to explicitly select the in-school cutoff it was testing; the production deadline policy was not changed.

## Handoff sequence

1. Complete period 146 using existing terms; reconcile its payroll and leave balances.
2. Complete individual amendment signatures/countersignatures, preserving actual execution dates; resolve salary and nonparticipant exceptions.
3. Correct and rehearse historical service-date handling and validate activation before enabling the engine.
4. People Operations enters/confirms Training PTO balances through October 9; create missing leave accounts and verify sick/support rates and classifications.
5. Enroll only reviewed employees with explicit effective service dates, leaving excluded employees on their existing arrangements.
6. Reconcile period 147 before posting: current services, late prior services, H-code units/minutes, Tier 3 and language/location additions, role duties, approved time, salary, mileage/stipends, all three leave buckets, and CSV totals.
7. Post only after the reviewed totals match; use CSV for the current processor handoff.

## Repeatable checks

From `backend`, with the intended database connection configured:

```sh
node src/scripts/auditPayrollReadiness.js --agency=2 --start=2026-10-10
```

The script opens a read-only transaction and exits 2 when configuration checks remain unresolved. Its output includes employee identifiers and must be stored privately. Passing these checks alone does not certify the historical-rate or end-to-end items above.

```sh
../frontend/node_modules/.bin/vitest run --config vitest.payroll-readiness.config.js
SKIP_DB_CONNECT=1 node --experimental-test-module-mocks --test --test-force-exit src/utils/__tests__/payrollSubmissionWindow.test.js src/services/__tests__/payrollCompliance.service.test.js src/services/__tests__/payrollPto.manualDirectAccrual.test.js src/services/__tests__/staffLearningCompensation.test.js
```

Validation: 99 Vitest tests and 18 Node tests passed. No live payroll calculation, post, export submission or payment was performed.
