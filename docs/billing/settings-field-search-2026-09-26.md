# Find and edit agency settings

Payer setup remains available for ITSCO (2), Next Level Up (6), and The Inner Strength Institute (377), as recorded in payer-setup-2026-09-26.md. This change does not alter payer enrollment, Claim.MD transmission, or stored tax IDs.

Settings search now includes field-level destinations for tax ID/EIN/FEIN/TIN/SSN, tax-ID type, timezone, account owner, website, phone, support email, intake sender, business name, street address, and ZIP code. Search results use the existing authorized settings catalog, retain agency scope, and open, scroll to, highlight, and focus the selected field. Search indexes labels and aliases, never saved field values. The Business Details search uses the same catalog. Keyboard selection and repeated searches work without remounting the same company's form and losing unsaved edits.

The tax-ID input displays EINs as `12-3456789` and SSNs as `123-45-6789`, including existing undashed values. Typed/pasted edits emit digits, preserve leading zeros, and use native form validation for nine digits. Invalid lengths are not silently truncated. Rendering alone never changes the saved value; no tax IDs were read or rewritten for this UI change.

The browser walkthrough also exposed and fixed two existing editor initialization failures: an immediate watcher referenced the form before its declaration, and the edit path used a numeric helper scoped only inside the save function. The editor regression test now loads a real component with synthetic API responses and checks focus for all eleven field targets.

Validation: 33 targeted tests passed. A local walkthrough of the actual Settings page, Company Workspace, and Agency Management components verified keyboard Tax ID search, agency 377 retained in navigation, formatted leading-zero EIN, local timezone search, and repeated EIN search at mobile width without browser errors. Preview requests used synthetic data and could not save. The production frontend build is checked before publication.
