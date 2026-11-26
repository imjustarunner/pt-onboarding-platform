One-time scoped transfer of an approved PTO payment

The operator supplies a reviewed manifest containing one request, employee,
agency, source/next payroll, exact hours/rate, source totals, rate-snapshot hash,
dated items and explicit authorization. No caller can supply different targets
to the generated database procedure: it accepts only that manifest hash and an
apply flag. No application release or production deployment is needed.

Security and attribution
- Explicit approval must cover provisioning the identities/access as well as
  the financial transfer and append-only audit entries before live execution.
- Provision an archived, inactive assistant audit actor with no email, password,
  agency membership or application login credentials. Retain that record so
  existing audit foreign keys continue identifying automation.
- Provision an ephemeral database user with EXECUTE on one fixed procedure only.
  It cannot SELECT or modify application tables directly; verify denial at run.
- Use the established cloud operator's actual IAM attribution for setup. Store
  the user's request as authorization; never record a human as the automation
  actor or mint an application authentication proof.
- Remove the database identity and procedure after either success or failure.
  Record cleanup failure explicitly if removal fails. Password exists only in
  process memory, is not logged, and is never written to a file.

Financial behavior
- Verify both periods are open and consecutive. Freeze the request, its saved
  rate and dated usage, current PTO totals, and unrelated approved leave.
- Move only the selected payment at its saved rate. Refuse an existing target
  adjustment, edited request, manual reduction or posted payroll.
- Preserve original approval attribution/time, request dates and usage entries.
  Append source ledger offsets and target usage; total balance stays unchanged.
- Attribute new adjustment/ledger/audit writes to the non-human audit actor.
  Invalidate the affected calculated summaries for rerun; retain run history.
- An existing transfer audit makes a repeat call a no-op.

Validation
The MySQL test creates connection-local TEMPORARY TABLES from the actual schema
(without foreign keys), fills only synthetic records and executes a temporary
test routine. It confirms every reset operates on temporary tables. No permanent
financial data is changed. Cases cover successful transfer, dry run/wrong hash,
repeat call, preserved approval/other PTO/balance, posted periods, edited current
pay, target adjustments, changed rate/date/usage, duplicate dated hours, actor
isolation, and transaction rollback after a later write fails.

Run the synthetic test with:
node backend/src/scripts/testPtoTransferProcedure.mjs

The runner defaults to preview; --apply is an explicit live financial action.
Supplying a plan is not a substitute for obtaining required authorization.
Keep employee-specific plans and evidence local; do not commit them.
