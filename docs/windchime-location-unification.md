# Windchime: one physical office, agency-specific billing profiles

## Intended model

The user clarified on 2026-09-29 that Windchime is one location for scheduling, booking, check-in, and billing. The application should not require selecting different Windchime locations for those tasks.

Use office **1** as the physical-location record for **437 Windchime Place**. Attach each agency's billing configuration to this location. Agency ownership and billing permissions must continue to scope the legal practice name, group NPI, taxonomy, defaults, and payer enrollment. Tax identity remains owned by its agency.

## Why duplicate records exist

Migration `1406_office_practice_pos_medicaid_override.sql` added practice billing fields directly to `office_locations`, with one practice name/NPI on each office row. It seeded ITSCO's fields, reactivated an NLU-owned Windchime row, and explicitly created a TISI-owned Windchime row. The Claim.MD billing resolver subsequently required agency ownership of that office row to avoid using another agency's billing identity.

That explains the current records; it does not establish a business requirement for separate physical locations. “Billing-only” was a description of the observed data, not a designated office type or the user's intended model.

## Read-only audit, 2026-09-29

| Office ID | Current role | References observed |
| --- | --- | --- |
| 1 | Shared active Windchime schedule | 13 rooms, 58 staff office links, 980 standing assignments, 18,055 office events; agency memberships for PlotTwistCo, ITSCO, NLU |
| 4 | Archived duplicate Windchime | PlotTwistCo membership; no rooms or bookings |
| 5 | Active NLU-specific Windchime billing row | No rooms/bookings; 8 service-location mappings, 2 group-NPI rows, 1 enrollment reference |
| 8 | Active TISI-specific Windchime billing row | No rooms/bookings; 5 service-location mappings, 1 group-NPI row, 6 enrollment references, 1 client default-office reference |

Counts reflect database foreign keys and the clinical database's office-reference columns. This audit does not claim to enumerate identifiers embedded in JSON, text, logs, or historical payload snapshots. No client names or clinical content were read for it.

## Required correction

1. Introduce explicit agency billing profiles attached to a physical office. Preserve the existing agency-specific practice values from office rows 1, 5, and 8 without overwriting another agency's values.
2. Make billing profile selection resolve by authorized agency + physical office. Update Claim.MD review/enrollment and other billing readers that currently depend on `office_locations.agency_id` or `practice_npi`.
3. Update office settings so physical address, rooms, and schedule are shared while agency-specific billing fields are edited in the appropriate agency scope.
4. Map TISI to the shared location and map prospective booking/service-location/default-office selections to office 1. Keep old IDs resolvable during migration; preserve submitted-claim payloads, existing enrollment identity, and audit history.
5. Retire duplicate physical-office choices only after mapping and compatibility checks pass. Do not delete the existing rows as the first step.
6. Validate each agency's existing and new billing resolutions before and after conversion, along with cross-agency denial, room-booking conflicts, kiosk visibility, service-location defaults, enrollment callbacks, and old links.

This needs a coordinated application and data migration; changing the office foreign keys alone is insufficient. No consolidation, billing-profile changes, enrollment requests, claim transmissions, or client-reference updates were performed during the kiosk deployment.

The shared lobby bookmark is **https://plottwisthq.com/kiosk-welcome/1**. It requires no sign-in and is not tied to one agency's billing record.
