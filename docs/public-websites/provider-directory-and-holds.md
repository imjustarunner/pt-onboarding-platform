# Public provider pages and weekly intake holds

## URLs and publishing

Replace `agency-slug` with the root tenant's actual slug and `provider-id` with its user ID:

- Counselors: `/agency-slug/find-counselor`
- Tutors: `/agency-slug/find-tutor`
- Coaches: `/agency-slug/find-coach`
- Individual profile: `/agency-slug/provider/provider-id?serviceType=counseling`
- Enrollment: `/join/agency-slug/counseling?providerId=provider-id`
- Collective: `/p/range/providers`; each affiliation links to its agency's individual profile.

Use `tutoring` or `coaching` for those services. `/agency-slug/book/provider-id` remains a separate appointment-request workflow.

At `/agency-slug/admin/public-services`, enable the service and enroll its published providers. Public availability must also be enabled. In Public Marketing Pages, associate root agencies under **agency sources** so `/p/` headers link their enabled directories. Schools remain affiliations, not tenants. New organizations gain provider links when their tenants and published services exist.

## Editing profiles

Signed-in superadmins, admins, support and staff can use **Edit public profile** directly on an individual profile, after the protected API verifies agency access. Names, title, biography, insurance, languages, public locations, session formats and accepting status update the existing canonical user/public-profile record. Photo uploads update the actual profile photo. Self-pay rates remain restricted to the existing admin rate editor. Clinical specialties, populations and approaches still come from the clinical profile; authorized staff can follow the full profile link to edit those fields. Private clinical records are never published by this editor.

## Schedule and hold lifecycle

The finder, profile and enabled enrollment picker use `ProviderAvailabilityService.computeWeekAvailability`, with schedule, busy calendar, office-booking and intake eligibility checks. Openings must be enabled for **new clients/intake**. Direct profile and slot requests recheck publication and provider membership. The full intake picker appears when exactly one provider is selected and clinical review has not paused matching.

Selecting a time protects that **recurring weekly local time**, including daylight-saving changes, until placement is resolved. There is no fifteen-minute timeout. It blocks overlapping public selections and public appointment requests across that provider's agency affiliations and session formats. A provider-wide advisory lock serializes public selection/request conflicts. Selecting a time never creates a client, booking, recurring schedule assignment, payment or message.

The bearer token is random; only its hash is stored in the hold table. The browser keeps it in same-tab session storage, never in a URL. Quick enrollment and single-client full intake bind the token to the created/matched client; replays cannot move a hold to a different client. Full-intake tokens travel separately from saved form responses and documents. Multi-client full intake does not guess which child owns a selection: staff can resolve those holds manually.

Explicit client/provider assignment changes and placement on booked office events or upcoming scheduled appointments resolve the attached holds. Changing the provider preference in enrollment releases the previous selection first. The public picker checks server status on restoration and every minute; selecting another time or choosing **Release this time** releases the previous hold.

Staff can review **Pending weekly intake holds** in Public Services & Booking, including selections not yet attached to a submitted intake. They can release a hold as placed, placed elsewhere, abandoned or duplicate. Resolution reason, timestamp and staff actor are retained. Staff scheduling remains authoritative; a hold is not a confirmed appointment. Staff should review unsubmitted/abandoned holds regularly because they intentionally do not expire.

## Public websites: Spanish and SMS previews

The shared language widget translates navigation and common copy immediately. Remaining public marketing text, including published editor content, uses the existing `/api/public/translations/translate-strings` translation/cache service. Form values, editor controls, URLs and HTML are not sent or rewritten. English can be restored without reloading; navigation retains the language selection. Translation failures leave readable English with a retry notice. Artwork with text baked into its pixels remains unchanged. Dynamic translation requires the application's configured translation service; this change does not install provider credentials.

The supplied artwork in `assets/SMSAssets/*website.png` is copied to frontend public assets and used for Open Graph/Twitter previews on `/p/tisi`, `/p/rise`, `/p/ptco`, `/p/mh4kidz` and `/p/range`, including subpages. The HTML server injects those tags before JavaScript runs, without requiring an agency database record. This changes link previews; it does not send SMS messages. Messaging clients may cache previously shared previews.

## Migration and verification

Apply **1430 first if it has not already run**, then **1431**, to each target main database before deploying this backend version:

```sh
npm --prefix backend run migrate -- --migration 1430
npm --prefix backend run migrate -- --migration 1431
```

1430 creates the hold table and adds public-profile details. 1431 adds persistent recurring holds, timezone, client linkage and resolution tracking. Expired legacy holds remain released; still-active legacy holds adopt the scheduler's agency timezone. These migrations were tested on a disposable MySQL 8.4 database, not applied to staging or production by this change.

Verification includes concurrent cross-agency selections, weekly overlap, spring/fall daylight-saving transitions, hashed-token ownership, binding/replay protection, placement resolution, and no booking side effects (`node database/tests/public-provider-holds.mjs`, disposable credentials only). Frontend tests cover the picker, profile editor, translations, metadata and existing public pages. Browser checks use synthetic API responses at desktop/mobile widths; they do not certify production configuration or submit real appointments/messages.
