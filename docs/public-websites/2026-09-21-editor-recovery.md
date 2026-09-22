# Website editor recovery and provider sidebar

## Where the earlier editors live

The previous work remains in Git and is still used by those page types:

- `a51e560c`: `PublicCareersView.vue` has inline copy, photo replacement, and typography controls on `/careers/:slug`.
- `72a5ac25`: `AdaptiveJoinLanding.vue` and the office intake start page have movable/resizable layout blocks on enrollment pages.
- `PublicMarketingLandingTisiView.vue`: the Inner Strength landing template has its own on-page editor for navigation, images, copy, service cards, and other sections.
- `MarketingDesignWorkspace.vue`: the public marketing admin screen has image cropping and responsive iframe previews.
- `f1c961b0`: ITSCO's newer custom website was implemented as `ItscoPublicWebsite.vue`; it does not render the TISI or careers editor.
- `1d027f1f`, `d7d44a8c`, and `f204f269` restored editing access and previews, but the shared website toolbar still linked to the admin form.

The ITSCO gap was missing integration, not deleted editor source. Do not replace the existing careers, enrollment, or TISI editors with the ITSCO adapter.

## Current editing flow

Use **Staff sign in** at the website footer. It opens the matching app domain's login with a return to the same website page. Verified super admins see **Edit this page** and **Log out**. A successful Google callback also saves the existing remembered-account shortcut on that app origin.

On ITSCO, **Edit this page** enables outlined marketing text and photos, including the hero background. Click an outline, change text or choose a photo, review the page, then **Save changes**. Failed saves retain the draft; discard and navigation guards protect unsaved work. Uploading alone does not publish the photo replacement. Published overrides are stored under `branding_json.itscoWebsite.inlineContent`; unrelated branding settings are merged from the latest saved page.

Provider photos/biographies still use **Edit public profile**, which updates the actual provider record. The website adapter edits marketing content, not clinical credentials, availability, staff records, or insurance data. Section layouts remain component-defined; this is not an unrestricted drag-and-drop canvas.

## Related fixes

- Desktop provider availability uses the right column; profile information and biography remain together on the left. Mobile retains its stacked layout and care-setting colors.
- Website policy links share the footer policy group.
- Analytics accepts individual provider paths and records new events at the exact path. Historical profile-specific areas recorded at the directory path are included only for their matching provider.
- Meeting prompts require a current scheduled window or recent live presence, rather than historical admissions. Dismissals persist per user in this browser for seven days.
- A five-minute worker closes empty rooms after their scheduled end date passes in the event/agency time zone. Join resolution enforces the same rule immediately. Recent presence prevents closure; attendance and payroll finalization are not changed. Ended supervision rooms cannot be reopened by the existing automatic-finalization recovery flow.

## Validation

Targeted frontend and backend tests cover editing authorization, image drafts/publishing, failed saves/discard, remembered login, provider analytics, persistent meeting dismissal, and local-day expiration. Chrome checks use simulated authenticated sessions and intercept all saves/uploads; no test edits are published to the live website. SQL checks use a disposable local MySQL database to verify live-room protection and profile-specific analytics counts.
