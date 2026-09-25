# Managed Workspace staff groups — September 25, 2026

Interview invitation/reminder rosters show attendee names only. Eligible external-client after-hours replies use the verified tenant messages@ sender, with Reply-To pointing back to the provider's mailbox. SSO, internal staff, and multi-recipient/group auto-reply exclusions remain in force.

## Directory audit

The following existing groups need ai@plottwistco.com added as MANAGER by the Workspace owner:

| Domain | Existing groups without the relay account |
| --- | --- |
| itsco.health | denver, interns, prelicensed, supervisors, unlicensed |
| nextleveluplcc.com | staff, interns, prelicensed, supervisors, unlicensed |

messages@plottwistco.com, messages@itsco.health, messages@nextleveluplcc.com, messages@innerstrengthin.com, messages@mh4kidz.com, and messages@risereviveco.com all exist, have the relay as MANAGER, and have accepted Gmail send-as verification. No new send-as aliases are needed for distribution groups. Google documents that nested Groups cannot be managers; authorized in-app managers use Bcc delivery to the verified member mailboxes instead of impersonating the distribution address.

References: [Groups Settings posting controls](https://developers.google.com/workspace/admin/groups-settings/v1/reference/groups), [Directory member roles and delivery settings](https://developers.google.com/workspace/admin/directory/reference/rest/v1/members).

## Membership rules

- Staff: active staff memberships, including onboarding employees with provisioned work/app addresses; exclude demo, archived, inactive, and prospective applicants.
- Interns: intern role, credential, or agency position; also included in unlicensed. Bachelors and explicitly unlicensed credentials join unlicensed.
- Prelicensed: LPCC, MFTC, SWC, LSW/candidate credentials or the agency prelicensed-supervision flag. A current full-license credential takes precedence over a stale flag or job label.
- Licensed: explicit LPC, LCSW, LMFT, LP/psychologist, or LAC credential tokens. Unknown qualifications are reported rather than guessed.
- Supervisors and supervisees: active supervision relationships and supervisor privileges. Each supervisor has a separate group, such as brittanysupervisees@itsco.health. Duplicate first names get stable user-id suffixes.
- Colorado, Denver, and Colorado Springs: active assigned work offices or explicit work_location; home addresses are not used. Existing location memberships without reliable work-location data are preserved for review.
- Only verified managed-domain user or personal Group mailboxes are added. Personal fallback addresses are never added. Nested app-only Group mailboxes remain recipients; their private delegate memberships are not expanded into other people's inboxes.
- Existing unmatched members and active managers are preserved for review. Known inactive staff and obsolete category/alias memberships are removed only during approved full reconciliation. The last Google Group owner is never removed automatically.

## App integration and controls

Migration 1492 creates the group catalog linking each Google Group to an email contact, private internal channel, and meeting invite group. SMS remains unavailable until texting is enabled; no placeholder phone numbers or SMS sends are created. Membership changes preserve chat history/read state. Managed meeting groups cannot be edited manually. Email, channel posting, and selecting a group for meeting invitations require an active group manager.

Incoming group delivery retains tenant context when a staff login has app inboxes in multiple agencies, including groups nested inside other groups. Authenticated Gmail Sent messages also route Bcc copies to the sending tenant; untrusted inbound headers cannot enable that path. This prevents the common staff account from making a tenant group conversation ambiguous.

Expanded five-minute reconciliation requires explicit `feature_flags.managedWorkspaceGroupsEnabled: true` and a `workspaceEmailDomain`. Once enrolled, the legacy ITSCO reconciler yields to this job so it cannot restore obsolete subscriptions. Only a platform superadmin can change enrollment or an enrolled tenant's managed domain. Self-service organizations are not enrolled by having SSO or a configured email domain. The five mapped tenants were explicitly enrolled after the approved initial reconciliation.

Google Directory returns primary account addresses for memberships added through aliases. Reconciliation compares account identity with the chosen tenant mailbox, preventing an alias mismatch from removing an active recipient. Groups Settings calls request JSON explicitly; otherwise this API returned empty successful responses during verification.

The existing outbound activity protection remains in effect, including the 50-recipient per-message limit and account volume limits. Authorized app group expansion counts the actual recipients. ITSCO's current staff audience has 48 addresses; sending to multiple groups or future growth beyond 50 will require a separate review of the bulk-delivery policy.

## Applied changes and validation

Migration 1492 was applied to the configured database. Google and app catalogs now contain 66 linked groups: PlotTwistCo 12, ITSCO 18, Next Level Up 14, Inner Strength 12, and MH4kidz 10. Of those, 55 groups were newly created. The existing-group plan applied 30 additions and 14 removals; new-group seeding was also completed. Follow-up reconciliation handles canonical Google aliases without duplicate membership churn.

A read-back of all 66 Google Groups verified manager-only posting, invitation-only joining, and the reviewed membership changes. All 66 catalog rows have email contact, chat channel, and meeting invite group links. The ten relay-manager gaps listed above remain for the owner to grant. No test emails were sent.

The focused messaging, meeting-invitation, and interview suite passes 203 tests in 33 files. Both changed Vue components compile. Google/DB setup is applied; the new app behavior and recurring job require the committed backend/frontend changes to deploy. A Git push alone is not deployment verification.

## Operator commands

Run from backend, loading the intended environment:

```sh
node src/scripts/reconcileManagedWorkspaceGroups.js --report=/tmp/group-preview.json
node src/scripts/reconcileManagedWorkspaceGroups.js --apply --create-missing-only --agency=2 --report=/tmp/new-groups.json
```

`--create-missing-only` skips every preexisting group, its posting permissions, and its subscriptions. After a partial new-group creation, `--resume-created=/tmp/new-groups.json` retries only addresses that the prior creation report recorded as created. New Directory group propagation is retried on 404; permission failures are reported, never interpreted as a missing group.

Full `--apply` reconciles existing subscriptions and posting restrictions. Automatic approval review initially rejected the bulk mutation. The user subsequently explicitly approved the reviewed 30 additions, 14 removals, manager-only posting, and ongoing sync. Preview CSV for this session: `/private/tmp/managed-existing-group-review.csv`.

## Data issues requiring follow-up

MH4kidz's app sender metadata used mh4kidz.org, but the managed Workspace and verified messages sender use mh4kidz.com; managed sender resolution uses the verified domain. MH4kidz has no user-agency staff records yet, so its ten groups contain the relay manager but no app audience or app managers. Rise & Revive has a Workspace domain and messages sender but no corresponding agency record was found, so no agency/roster is invented. Burning Sage is not accessible through the managed Directory credentials and is not enrolled.

Some active providers have missing/ambiguous qualifications (ITSCO user IDs 193, 776, 1157, 1185; NLU 993). Their existing classification memberships are preserved pending accurate staff records. ITSCO user 1 has no verified work mailbox; no guessed address or personal fallback is added.
