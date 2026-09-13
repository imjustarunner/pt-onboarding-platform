# Public provider pages and temporary selections

## URLs and publishing

Replace `agency-slug` with the root tenant's actual slug and `provider-id` with its user ID:

- Counselors: `/agency-slug/find-counselor`
- Tutors: `/agency-slug/find-tutor`
- Coaches: `/agency-slug/find-coach`
- Individual profile: `/agency-slug/provider/provider-id?serviceType=counseling`
- Service enrollment: `/join/agency-slug/counseling?providerId=provider-id`
- Collective: `/p/range/providers`; each affiliation links to its agency's individual profile.

Use `tutoring` or `coaching` in the profile/enrollment URLs for those services. The existing `/agency-slug/book/provider-id` remains the separate appointment-request workflow.

At `/agency-slug/admin/public-services`, enable the service and enroll its published providers. The tenant's public availability switch must also be on. Configure the public biography, photo and clinical facets from the staff user profile. Its public-profile editor now includes languages, public practice locations and session formats; the biography supports 4,000 characters. Unpublished information is identified as such, and no verification or algorithmic-match badge is fabricated.

In the superadmin Public Marketing Pages editor, associate the root agency under the page's **agency sources**. `/p/` headers automatically link enabled counseling, tutoring and coaching directories for those agencies. Schools and other affiliated organizations are not treated as tenants. MH4Kidz and Rise will gain these links once their tenants and published services exist and are associated with their marketing pages.

## Where the openings come from

The finder, profile and enrollment picker use `ProviderAvailabilityService.computeWeekAvailability`, including its schedule, busy-calendar and booked-office checks. A schedule opening must be eligible for **intake/new clients**, not merely existing-client sessions. In-person intake toggles and virtual `available_for_intake` settings remain authoritative. The provider's accepting-new-clients setting (or its public-profile override) gates new-client openings. Direct profile and slot requests recheck agency/service publication and provider membership.

The existing enabled Choose a Provider step now offers an opening picker after selecting a provider. The full intake flow also offers it when exactly one provider is selected and clinical review has not paused matching. With provider selection disabled, the picker is not shown.

## Hold lifecycle

Selecting an actual time from the agency finder or opening picker calls the temporary-hold endpoint. A hold:

- lasts 15 minutes according to the database clock;
- blocks overlapping public selections across agency affiliations and session formats for that provider;
- is created under a provider-wide database advisory lock, shared by public appointment-request insertion;
- stores only a hash of its unpredictable bearer token;
- persists across refresh in same-tab session storage, with no token in the URL;
- can be released with its owning token, or expires automatically without a cleanup job;
- never creates an appointment, recurring assignment, payment, client, or message.

Quick enrollment stores a server-verified time preference, including whether its hold was active at submission. Full intake stores a clearly labeled time preference in its submission responses. Staff must review the preference and recheck availability before scheduling. Submission does not extend the hold. Existing submitted appointment requests remain separate reviewable requests and retain their existing lifecycle.

Staff scheduling is authoritative; a public hold is not a booking or a guarantee against a staff schedule change. Expired hold records are ignored immediately. They can be purged later under the application's operational retention policy.

## Migration and validation

Apply migration 1430 to each target main database using its normal backend environment:

```sh
npm --prefix backend run migrate -- --migration 1430
```

This creates `public_provider_slot_holds` and adds `provider_public_profiles.public_details_json`. It does not publish providers, change payer permissions, or backfill client records. The migration has been tested on a disposable MySQL 8.4 database; it has not been applied to staging or production by this change. Until applied, existing directory/profile reads remain available, and creating a hold reports that temporary selection is being prepared.

Checks:

- `node database/tests/public-provider-holds.mjs` against the disposable database documented in that script: simultaneous selections, overlapping ranges, cross-agency token isolation, expiration, request conflicts and lock cleanup.
- `npm --prefix frontend test -- src/components/publicServices/__tests__/PublicProviderSlotPicker.test.js`: conflict/error behavior, expiry, refresh persistence and no booking request on selection.
- Browser checks at 320, 390, 768, 1024, 1440 and 2048 pixels, using synthetic API fixtures; no real appointments or messages submitted.
