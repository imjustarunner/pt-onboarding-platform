# Provider directory availability

The directory includes providers without published openings by default. Office, virtual, and school filters keep closed and waitlisted providers visible. Default ordering is open in all settings, open office/virtual, office/virtual waitlist, open school, school waitlist, then closed. Schedule openings override stale profile flags. Gender uses the existing public marketing field unless explicitly overridden or cleared in the public profile editor.

Clinical facets are normalized when read: recognized age aliases move to client ages, recognized populations move out of specialties, numbered/comma lists split, and aliases deduplicate. Original staff-entered answers are retained. Long narrative fragments do not become specialty filter options.

Profiles include the next four schedule weeks, recurring typical hours, explicit waitlist enrollment, office/school locations and Google Maps links. Availability remains visible when online booking is disabled; booking writes still require booking enablement and service enrollment. No license verification claim is fabricated.

Waitlists are opt-in through availability settings or a format-specific waitlist status. Visitors submit through the existing encrypted support conversation system. Provider/service/format metadata is stored with the ticket. Agency-scoped staff can review requests in Public Services, open the conversation, and close it after placement or withdrawal.

## Release

Apply migrations **1471** (waitlist ticket metadata) and **1472** (new intake publication triggers) before deploying the backend, then deploy the frontend. This work does not apply migrations or deploy production.

Closing intake withdraws future intake publications, recurring intake hours, and reported school openings in a transaction. Existing bookings, office reservations, regular-session hours, and pending placement holds remain intact. Publishing a new opening reopens global acceptance for staff who see clients. SQL triggers cover all current publication tables, including the legacy office grid.

## Validation

- 29 focused backend Vitest tests, 20 frontend tests, and 6 reminder tests pass.
- Both migrations were applied to a disposable MySQL 8 database. Verified all 12 insertion/update triggers, closure, rollback, preservation of booked events and regular-session hours, provider isolation, and reopening.
- Frontend production build passes with an 8 GB Node heap.
- Browser fixtures at 1440, 768, and 390 pixels verify ordering, profile availability, waitlist fields, and no horizontal overflow or JavaScript errors.
- Broader scheduling suite had two existing billing-access tests blocked by its configured local database connection; targeted tests above use fixtures and mocks.
