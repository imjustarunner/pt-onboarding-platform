Clarify sick-leave accrual hours in payroll displays
2026-11-25

Problem
The label "Sick leave hours" appeared beside total pay. A qualifying accrual
basis such as91.37 could be mistaken for paid sick leave or actual worked hours.

Change
Preview, employee pay detail, mobile payroll and report-column display now say
"Sick leave accrual basis (equivalent hours)". The preview and employee details
also show "Sick leave used (paid)" from saved sickPtoHours when available. Missing
historical sick-hour detail is not replaced with an invented zero. The preview
shows the ordinary-earnings dollar control and explains using saved dollar
amounts instead of multiplying equivalents by a service or rounded allocation
rate. Existing saved calculations, accrual, export field keys and pay are intact.

This change makes no overtime determination. Actual work records and applicable
classification/rules govern overtime; absence of an overtime request is not
treated as proof of no overtime. No production financial records were changed.

Validation
- Frontend payroll Vitest suite:13 files,146 tests passed.
- Existing sick-leave calculation Node tests:13 passed.
- All five changed Vue files parsed and compiled successfully.
- git diff --check passed.
- Regression covers91.37accrual equivalents with zero paid sick leave, separate
  ordinary/total dollars, a refresh with nonzero paid sick leave, and no writes.
- First frontend run could not resolve FundThred icons omitted by the sparse
  checkout. Including the tracked icons resolved it; the complete rerun passed.
- Existing raw-import tests emit missing-Pinia warnings while passing.
- No full site build run in this narrow checkout; release runs its usual build.

Release
Implementation/testing only. Integrate via the separate release chat.
Frontend-only change; no migration or backend deployment requirement.
Compatible with the existing backend response and earlier provider/PTO branch.
No main merge, production deployment or workflow dispatch performed.
