# People Operations and supervision history

Rachel Finch's employee account (507) retained its active admin role. ITSCO's
tenant configuration had `hiringEnabled: false` and no `peopleOpsEnabled` flag,
which hid the hub while capability-based Applicants quick navigation still worked.
Migration 1509 restores those two ITSCO features without changing roles or other
agencies. Agency settings now preserve flags omitted by an individual form, and
the People Operations hub also accepts serialized feature flag JSON.

Migration 1510 separates ended supervision from current assignments:

- Existing assignments involving inactive, terminated, or archived accounts are
  copied into `supervisor_assignment_history` before removal.
- User status changes, account disabling, and archiving retire assignments in the
  same transaction. Reactivation does not restore them.
- Removal and reassignment preserve the prior supervisor's name, agency, type,
  primary designation, and dates. Historical rows do not grant supervisor access.
- Current assignments cannot be created for inactive accounts, including writes
  outside the assignment API.
- User profile → Assignments → Supervisor Assignments → Past supervisors displays
  history. Admin/support history access is restricted to their tenant memberships;
  it does not require the former employee to retain an agency membership.

`ended_at` is the time the assignment was removed. For the backfill it is the
migration time, not a reconstructed employment end date. Records deleted before
this change cannot be recreated from the current assignment table.

Both migrations run through the existing startup migration runner on deployment.
The SQL integration test uses the same statement parser and a disposable local
MySQL socket, with synthetic data only:

```sh
cd backend
../frontend/node_modules/.bin/vitest run --config vitest.supervision.config.js
SUPERVISION_TEST_SOCKET=/private/tmp/pt-supervision-mysql/mysql.sock node --test src/services/__tests__/supervisionHistory.mysql.test.js
```

Validation: 14 frontend tests, 7 backend tests, the MySQL integration test
(including migration retry and transactional rollback), and the full frontend
production build passed.
