# Provider facts and availability — September 20, 2026

Aneta appeared on the ITSCO website but her availability endpoint returned 404 because ITSCO had no `agency_public_service_types` rows. The endpoint incorrectly required booking service configuration even for a read-only counseling directory. Published clinical providers now have schedule summaries without booking enrollment. Time selection still requires the enabled agency service, agency booking flag, and active provider enrollment. Other service types and booking writes retain their existing restrictions.

Her saved `pt_specialties_max25` answer was present; the search index was stale. Public clinical facets now read tenant-scoped `user_info_values` directly. Duplicate definitions use the most recent answer (including an intentional empty answer), with tenant definitions taking precedence over platform templates. Explicit aliases normalize problems, ages, populations and therapy approaches across legacy keys. Narrative and unrecognized answers are preserved in source records and placed in the reconciliation report for review, rather than inferred as provider expertise.

## Onboarding integration for the parallel onboarding work

Use these existing field keys; do not create a second set of profile answers:

| Profile section | Field key | Option source |
| --- | --- | --- |
| Specialties — What I help with | `specialties_general` | `provider_specialties` |
| Client Ages — Who I see by age | `age_specialty` | `provider_client_ages` |
| Populations Served — Communities and client types | `groups` | `provider_populations_served` |
| Therapy Approaches — How I provide treatment | `modality` | `provider_therapy_approaches` |

All four are multi-select. The shared definition reader also supplies the catalog to existing module fields and recognizes legacy aliases. Spec sync uses the same catalog. `pt_specialties_max25` and `treatment_prefs_max15` remain supported as legacy specialty/approach answers. `mental_health` belongs with specialties, not populations; historical `modality` answers containing Individuals/Groups are classified as populations by value. No ages or treatment methods are offered in the new population catalog. Do not derive client populations from a provider's own gender or ethnicity.

The backend catalog lives in `backend/src/constants/providerClinicalTaxonomy.js`; the frontend deployment has a synchronized copy, with a test enforcing equality. Future changes must update both.

## Applied data reconciliation

`backend/scripts/reconcile-provider-clinical-facets.mjs` is dry-run by default. Requires `--agency=<id>` and `--report=<private path>`; use `--apply` only after reviewing the report. The apply path transactionally replaces only clinical index rows for active client-seeing providers and updates that agency's existing matching field option definitions. It never rewrites original survey answers. It writes original index rows, definitions, normalized results and unresolved answers to the private report before applying.

ITSCO reconciliation: 90 active client-seeing accounts reviewed; 23 have recognized specialty answers; 54 entries retained for review. Aneta's recovered specialties are Behavioral Concerns, Learning Difficulties, and School / Academic Concerns. Original clinical answers remain unchanged. No booking services or enrollments were enabled.

## Availability presentation

- Published availability is visible independently of online time selection.
- With selection disabled, times are informational and the visitor contacts the team.
- With selection enabled, the visitor can request a time through the existing hold workflow.
- An accepting provider with no posted times says the team will work directly with the client to find a time.
- Closed and waitlisted providers retain their distinct status and next steps.

The backend/frontend code must be deployed for the endpoint and UI fixes. The reconciled index/options are already stored in the configured database. No new migration is required.
