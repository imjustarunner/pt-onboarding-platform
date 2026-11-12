SYNTHETIC NLU TUTORING QA ONLY - no real student or clinical record.

RUN PLAN: ../../QA-ADDENDUM-2026-11-01-NLU-TUTORING-END-TO-END.txt
This packet prepares APP-based testing. Configuration453/454 exists. The
November12 retest handoff records retained Finley1496, Morgan1759, Parker2545
and Quinn2547; reuse them. This generator creates files, not live accounts.
Use existing vault accounts and the controlled testing inbox. All IDs created
by the app go in the run ledger. No passwords or raw token links go here.

NLU QA agency453 / nlu-qa-demo; learning program454 / nlu-qa-learning.
Expected tutor/parent host: app.nextleveluplcc.com. No AuricWell enrollment,
clinical-note prerequisite or AuricWell-branded parent portal for tutoring.
NLU live agency6 supplied reusable configuration only and is read-only.

FILES
fixtures.json: people to create/reuse, budgets, exact seeded configuration IDs.
catalog-and-tutor.json: NLU copied tier inputs plus two added synthetic packages.
enrollment-answers.json: academic-only parent answers.
math/reading-worksheet.pdf and .txt: original synthetic student materials.
answer-key-and-scoring.txt: private tutor key; never publish to the learner.
session-examples.txt: baseline, plan, notes, practice and progress examples.
cases.csv / email-cases.csv / audit-ledger.csv: blank actual-evidence ledgers.
nlu-catalog-baseline.json: internal configuration source snapshot, not student data.

All live cases start NOT RUN. A passing engineering test, prepared file, seeded
catalog, preview or Sent label does not prove real browser or inbox behavior.
Payment tests require a confirmed sandbox merchant; no real card/charge,
QuickBooks posting, insurance claim or approved payroll export is authorized.
Normal guardian permissions, workflow prerequisites and due times remain.

Rebuild offline: python3 docs/qa/tools/buildTutoringQaFixtures.py
The generator refuses to replace a cases ledger containing entered results.
It uses existing repository code and Python standard library, no installs.
